// CoMemo - Background Service Worker

// ============================================
// ヘルパー関数
// ============================================

// Content scriptが存在するか確認し、なければ注入する
async function ensureContentScript(tabId) {
try {
	const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
	return response && response.pong;
} catch (e) {
	try {
	await chrome.scripting.executeScript({
		target: { tabId: tabId },
		files: ['lib/supabase.min.js', 'src/js/config.js', 'src/js/content.js']
	});
	await chrome.scripting.insertCSS({
		target: { tabId: tabId },
		files: ['src/css/content.css']
	});
	return true;
	} catch (err) {
	console.error('スクリプト注入エラー:', err);
	return false;
	}
}
}

// ============================================
// イベントリスナー
// ============================================

// インストール・更新時：コンテキストメニュー作成
chrome.runtime.onInstalled.addListener((details) => {
if (details.reason === 'install') {
	console.log('CoMemo がインストールされました');
} else if (details.reason === 'update') {
	console.log('CoMemo が更新されました');
}

chrome.contextMenus.create({
	id: 'comemo-add',
	title: 'ここにメモを追加',
	contexts: ['page', 'selection']
});
});

// 拡張機能アイコンクリック時：パネルをトグル
chrome.action.onClicked.addListener(async (tab) => {
if (tab && tab.id) {
	const ready = await ensureContentScript(tab.id);
	if (ready) {
	try {
		await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
	} catch (e) {
		console.error('パネルトグルエラー:', e);
	}
	}
}
});

// コンテキストメニュークリック時：メモ追加
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
if (info.menuItemId === 'comemo-add' && tab && tab.id) {
	await ensureContentScript(tab.id);
	chrome.tabs.sendMessage(tab.id, { action: 'addMemo' });
}
});

// content scriptからのメッセージ処理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
if (request.action === 'captureVisibleTab') {
	chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
	if (chrome.runtime.lastError) {
		sendResponse({ error: chrome.runtime.lastError.message });
	} else {
		sendResponse({ dataUrl: dataUrl });
	}
	});
	return true;
} else if (request.action === 'addMemoFromPopup') {
	(async () => {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (tab && tab.id) {
		const ready = await ensureContentScript(tab.id);
		if (ready) {
		try {
			const response = await chrome.tabs.sendMessage(tab.id, { action: 'addMemo' });
			sendResponse(response);
		} catch (e) {
			sendResponse({ success: false, error: e.message });
		}
		} else {
		sendResponse({ success: false, error: 'スクリプト注入失敗' });
		}
	} else {
		sendResponse({ success: false, error: 'タブが見つかりません' });
	}
	})();
	return true;
}
});
