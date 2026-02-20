// CoMemo - Content Script
// ページにメモを追加し、共有する機能

(function() {
'use strict';

console.log('[CoMemo] Content script loaded');

// フォント読み込み
try {
	const fontUrl = chrome.runtime.getURL('assets/fonts/OoohBaby-Regular.woff2');
	const style = document.createElement('style');
	style.textContent = `@font-face { font-family: 'Oooh Baby'; font-style: normal; font-weight: 400; font-display: swap; src: url('${fontUrl}') format('woff2'); }`;
	(document.head || document.documentElement).appendChild(style);
} catch (e) {
	console.warn('[CoMemo] フォント読み込みスキップ:', e);
}

// ============================================
// 定数
// ============================================

const ARROW_HEAD_SIZE = 15;
const HIT_AREA_COLOR = 'rgba(0,0,0,0.01)';
const SVG_Z_INDEX = '2147483645';
const SAVE_DEBOUNCE_MS = 500;
const NOTIFY_SHORT = 2000;
const NOTIFY_LONG = 3000;

// ============================================
// グローバル状態
// ============================================

// データ
let memos = [];
let shapes = [];
let currentCollectionId = null;
let currentShareCode = null;

// 図形描画状態
let isDrawingMode = false;
let currentDrawingTool = null;
let currentShapeColor = '#e53935';
let isDrawing = false;
let drawStartX = 0;
let drawStartY = 0;
let currentPreviewShape = null;
let selectedShapeId = null;

// 元に戻す
let undoStack = [];

// 保存制御
let saveTimeout = null;

// UI
let panelElement = null;

// Supabase
let supabase = null;

// ============================================
// ユーティリティ関数
// ============================================

function generateId() {
	return Math.random().toString(36).substring(2, 15);
}

function generateShareCode() {
	return Math.random().toString(36).substring(2, 10);
}

function getNormalizedUrl() {
	const url = new URL(window.location.href);
	url.searchParams.delete('comemo');
	return url.origin + url.pathname;
}

function getShareCodeFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.get('comemo');
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function svgEl(tag, attrs) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, value);
	return el;
}

function calcArrowPoints(startX, startY, endX, endY) {
	const angle = Math.atan2(endY - startY, endX - startX);
	const pts = [
	[endX, endY],
	[endX - ARROW_HEAD_SIZE * Math.cos(angle - Math.PI / 6), endY - ARROW_HEAD_SIZE * Math.sin(angle - Math.PI / 6)],
	[endX - ARROW_HEAD_SIZE * Math.cos(angle + Math.PI / 6), endY - ARROW_HEAD_SIZE * Math.sin(angle + Math.PI / 6)]
	];
	return pts.map(p => p.join(',')).join(' ');
}

function getShapeBounds(shape) {
	const x = Math.min(shape.startX, shape.endX);
	const y = Math.min(shape.startY, shape.endY);
	const w = Math.abs(shape.endX - shape.startX);
	const h = Math.abs(shape.endY - shape.startY);
	return { x, y, w, h, cx: (shape.startX + shape.endX) / 2, cy: (shape.startY + shape.endY) / 2 };
}

// ============================================
// 通知
// ============================================

function showNotification(message) {
	let notification = document.getElementById('comemo-notification');
	if (!notification) {
	notification = document.createElement('div');
	notification.id = 'comemo-notification';
	notification.className = 'comemo-notification';
	document.body.appendChild(notification);
	}
	notification.textContent = message;
	notification.classList.add('comemo-notification-show');
}

function hideNotification() {
	const notification = document.getElementById('comemo-notification');
	if (notification) {
	notification.classList.remove('comemo-notification-show');
	}
}

function showTimedNotification(message, duration) {
	showNotification(message);
	setTimeout(hideNotification, duration || NOTIFY_SHORT);
}

// ============================================
// DOMコンテナ
// ============================================

function createMemoContainer() {
	let container = document.getElementById('comemo-container');
	if (!container) {
	container = document.createElement('div');
	container.id = 'comemo-container';
	document.body.appendChild(container);
	}
	return container;
}

function createSvgContainer() {
	let svg = document.getElementById('comemo-svg-container');
	if (!svg) {
	svg = svgEl('svg', { id: 'comemo-svg-container', class: 'comemo-svg-container', 'pointer-events': 'none', overflow: 'visible' });
	Object.assign(svg.style, { position: 'absolute', top: '0', left: '0', zIndex: SVG_Z_INDEX,
		width: document.documentElement.scrollWidth + 'px', height: document.documentElement.scrollHeight + 'px' });
	document.body.appendChild(svg);

	const resizeObserver = new ResizeObserver(() => {
		svg.style.width = document.documentElement.scrollWidth + 'px';
		svg.style.height = document.documentElement.scrollHeight + 'px';
	});
	resizeObserver.observe(document.body);
	}
	return svg;
}

// ============================================
// ストレージ（ローカル・Supabase）
// ============================================

function initSupabase() {
	if (typeof window.COMEMO_CONFIG !== 'undefined' && window.COMEMO_CONFIG.SUPABASE_URL) {
	supabase = window.supabase.createClient(
		window.COMEMO_CONFIG.SUPABASE_URL,
		window.COMEMO_CONFIG.SUPABASE_ANON_KEY
	);
	}
}

async function saveToLocal() {
	const pageUrl = getNormalizedUrl();
	const data = {
	memos: memos,
	shapes: shapes,
	shareCode: currentShareCode,
	collectionId: currentCollectionId
	};
	await chrome.storage.local.set({ [pageUrl]: data });
}

async function loadFromLocal() {
	const pageUrl = getNormalizedUrl();
	const result = await chrome.storage.local.get(pageUrl);
	if (result[pageUrl]) {
	return result[pageUrl];
	}
	return null;
}

async function saveAllData() {
	await saveToLocal();
	if (supabase) {
	await saveToSupabase();
	}
}

async function saveMemoContent(memo) {
	await saveAllMemos();
}

async function saveMemoPosition(memo) {
	await saveAllMemos();
}

async function saveAllMemos() {
	await saveToLocal();

	// Supabase保存はdebounce（500ms後に実行）
	if (supabase) {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(async () => {
		await saveToSupabase();
	}, SAVE_DEBOUNCE_MS);
	}
}

async function saveToSupabase() {
	if (!supabase) return null;

	try {
	// 既存のcollectionIdがある場合、Supabaseに存在するか確認
	if (currentCollectionId) {
		const { data: existingCollection } = await supabase
		.from('memo_collections')
		.select('id')
		.eq('id', currentCollectionId)
		.single();

		if (!existingCollection) {
		currentCollectionId = null;
		currentShareCode = null;
		}
	}

	if (!currentCollectionId) {
		currentShareCode = generateShareCode();
		const { data: collection, error: collectionError } = await supabase
		.from('memo_collections')
		.insert({
			page_url: getNormalizedUrl(),
			share_code: currentShareCode
		})
		.select()
		.single();

		if (collectionError) throw collectionError;
		currentCollectionId = collection.id;
	}

	await supabase
		.from('memos')
		.delete()
		.eq('collection_id', currentCollectionId);

	if (memos.length > 0) {
		const memosToInsert = memos.map(m => ({
		id: m.id,
		collection_id: currentCollectionId,
		position_x: Math.round(m.position_x),
		position_y: Math.round(m.position_y),
		content: m.content,
		color: m.color
		}));

		const { error: memosError } = await supabase
		.from('memos')
		.insert(memosToInsert);

		if (memosError) throw memosError;
	}

	await supabase
		.from('shapes')
		.delete()
		.eq('collection_id', currentCollectionId);

	if (shapes.length > 0) {
		const shapesToInsert = shapes.map(s => ({
		id: s.id,
		collection_id: currentCollectionId,
		type: s.type,
		start_x: s.startX,
		start_y: s.startY,
		end_x: s.endX,
		end_y: s.endY,
		color: s.color
		}));

		const { error: shapesError } = await supabase
		.from('shapes')
		.insert(shapesToInsert);

		if (shapesError) throw shapesError;
	}

	return currentShareCode;
	} catch (error) {
	console.error('Supabase保存エラー:', error);
	return null;
	}
}

async function loadFromSupabase(shareCode) {
	if (!supabase) return null;

	try {
	const { data: collection, error: collectionError } = await supabase
		.from('memo_collections')
		.select('*')
		.eq('share_code', shareCode)
		.single();

	if (collectionError || !collection) return null;

	const { data: memosData, error: memosError } = await supabase
		.from('memos')
		.select('*, comments(*)')
		.eq('collection_id', collection.id);

	if (memosError) throw memosError;

	const { data: shapesData, error: shapesError } = await supabase
		.from('shapes')
		.select('*')
		.eq('collection_id', collection.id);

	if (shapesError) throw shapesError;

	const shapesFormatted = (shapesData || []).map(s => ({
		id: s.id,
		type: s.type,
		startX: s.start_x,
		startY: s.start_y,
		endX: s.end_x,
		endY: s.end_y,
		color: s.color,
		created_at: s.created_at
	}));

	return {
		collection: collection,
		memos: memosData || [],
		shapes: shapesFormatted
	};
	} catch (error) {
	console.error('Supabase読み込みエラー:', error);
	return null;
	}
}

async function generateShareUrl() {
	let shareCode = currentShareCode;

	if (supabase) {
	shareCode = await saveToSupabase();
	}

	if (!shareCode) {
	shareCode = generateShareCode();
	currentShareCode = shareCode;
	await saveToLocal();
	}

	const url = new URL(window.location.href);
	url.searchParams.set('comemo', shareCode);
	return url.toString();
}

// ============================================
// 図形: リサイズ・ビジュアルヘルパー
// ============================================

function getCornerHandles(shape) {
	const minX = Math.min(shape.startX, shape.endX);
	const maxX = Math.max(shape.startX, shape.endX);
	const minY = Math.min(shape.startY, shape.endY);
	const maxY = Math.max(shape.startY, shape.endY);
	const startIsLeft = shape.startX <= shape.endX;
	const startIsTop = shape.startY <= shape.endY;

	return [
	{ cx: minX, cy: minY, cursor: 'nwse-resize',
		xField: startIsLeft ? 'startX' : 'endX', yField: startIsTop ? 'startY' : 'endY' },
	{ cx: maxX, cy: minY, cursor: 'nesw-resize',
		xField: startIsLeft ? 'endX' : 'startX', yField: startIsTop ? 'startY' : 'endY' },
	{ cx: minX, cy: maxY, cursor: 'nesw-resize',
		xField: startIsLeft ? 'startX' : 'endX', yField: startIsTop ? 'endY' : 'startY' },
	{ cx: maxX, cy: maxY, cursor: 'nwse-resize',
		xField: startIsLeft ? 'endX' : 'startX', yField: startIsTop ? 'endY' : 'startY' },
	];
}

function createResizeHandles(shape, group) {
	const handles = [];
	let handleDefs;

	if (shape.type === 'arrow') {
	handleDefs = [
		{ cx: shape.startX, cy: shape.startY, xField: 'startX', yField: 'startY', cursor: 'crosshair' },
		{ cx: shape.endX, cy: shape.endY, xField: 'endX', yField: 'endY', cursor: 'crosshair' },
	];
	} else {
	handleDefs = getCornerHandles(shape);
	}

	handleDefs.forEach(def => {
	const circle = svgEl('circle', {
		cx: def.cx, cy: def.cy, r: '6', fill: 'white',
		stroke: shape.color, 'stroke-width': '2', class: 'comemo-resize-handle',
		'data-handle-x-field': def.xField, 'data-handle-y-field': def.yField
	});
	circle.style.cursor = def.cursor;
	group.appendChild(circle);
	handles.push(circle);
	});

	return handles;
}

function updateShapeVisuals(shape, refs) {
	if (shape.type === 'arrow') {
	refs.hitArea.setAttribute('x1', shape.startX);
	refs.hitArea.setAttribute('y1', shape.startY);
	refs.hitArea.setAttribute('x2', shape.endX);
	refs.hitArea.setAttribute('y2', shape.endY);
	if (refs.visibleLine) {
		refs.visibleLine.setAttribute('x1', shape.startX);
		refs.visibleLine.setAttribute('y1', shape.startY);
		refs.visibleLine.setAttribute('x2', shape.endX);
		refs.visibleLine.setAttribute('y2', shape.endY);
	}
	if (refs.arrowHead) {
		refs.arrowHead.setAttribute('points', calcArrowPoints(shape.startX, shape.startY, shape.endX, shape.endY));
	}
	} else if (shape.type === 'rect') {
	const b = getShapeBounds(shape);
	refs.hitArea.setAttribute('x', b.x - 8);
	refs.hitArea.setAttribute('y', b.y - 8);
	refs.hitArea.setAttribute('width', b.w + 16);
	refs.hitArea.setAttribute('height', b.h + 16);
	refs.visibleElement.setAttribute('x', b.x);
	refs.visibleElement.setAttribute('y', b.y);
	refs.visibleElement.setAttribute('width', b.w);
	refs.visibleElement.setAttribute('height', b.h);
	} else if (shape.type === 'ellipse') {
	const b = getShapeBounds(shape);
	refs.hitArea.setAttribute('cx', b.cx);
	refs.hitArea.setAttribute('cy', b.cy);
	refs.hitArea.setAttribute('rx', b.w / 2 + 8);
	refs.hitArea.setAttribute('ry', b.h / 2 + 8);
	refs.visibleElement.setAttribute('cx', b.cx);
	refs.visibleElement.setAttribute('cy', b.cy);
	refs.visibleElement.setAttribute('rx', b.w / 2);
	refs.visibleElement.setAttribute('ry', b.h / 2);
	}

	if (refs.handles && refs.handles.length > 0) {
	if (shape.type === 'arrow') {
		refs.handles[0].setAttribute('cx', shape.startX);
		refs.handles[0].setAttribute('cy', shape.startY);
		refs.handles[1].setAttribute('cx', shape.endX);
		refs.handles[1].setAttribute('cy', shape.endY);
	} else {
		const corners = getCornerHandles(shape);
		corners.forEach((corner, i) => {
		if (refs.handles[i]) {
			refs.handles[i].setAttribute('cx', corner.cx);
			refs.handles[i].setAttribute('cy', corner.cy);
		}
		});
	}
	}
}

// ============================================
// 図形: 要素作成・選択・削除
// ============================================

function createShapeElement(shape) {
	const svg = createSvgContainer();

	const group = svgEl('g', { 'data-shape-id': shape.id, class: 'comemo-shape', 'pointer-events': 'all' });
	group.style.cursor = 'move';

	let hitArea;
	let visibleElement;
	let visibleLine = null;
	let arrowHead = null;

	if (shape.type === 'arrow') {
	hitArea = svgEl('line', {
		x1: shape.startX, y1: shape.startY, x2: shape.endX, y2: shape.endY,
		stroke: HIT_AREA_COLOR, 'stroke-width': '24', 'pointer-events': 'stroke'
	});
	group.appendChild(hitArea);

	visibleLine = svgEl('line', {
		x1: shape.startX, y1: shape.startY, x2: shape.endX, y2: shape.endY,
		stroke: shape.color, 'stroke-width': '3'
	});
	group.appendChild(visibleLine);

	arrowHead = svgEl('polygon', { points: calcArrowPoints(shape.startX, shape.startY, shape.endX, shape.endY), fill: shape.color });
	group.appendChild(arrowHead);

	} else if (shape.type === 'rect') {
	const b = getShapeBounds(shape);
	hitArea = svgEl('rect', {
		x: b.x - 8, y: b.y - 8, width: b.w + 16, height: b.h + 16,
		stroke: HIT_AREA_COLOR, 'stroke-width': '20', fill: HIT_AREA_COLOR, 'pointer-events': 'all'
	});
	group.appendChild(hitArea);

	visibleElement = svgEl('rect', {
		x: b.x, y: b.y, width: b.w, height: b.h,
		stroke: shape.color, 'stroke-width': '3', fill: 'none'
	});
	group.appendChild(visibleElement);

	} else if (shape.type === 'ellipse') {
	const b = getShapeBounds(shape);
	hitArea = svgEl('ellipse', {
		cx: b.cx, cy: b.cy, rx: b.w / 2 + 8, ry: b.h / 2 + 8,
		stroke: HIT_AREA_COLOR, 'stroke-width': '20', fill: HIT_AREA_COLOR, 'pointer-events': 'all'
	});
	group.appendChild(hitArea);

	visibleElement = svgEl('ellipse', {
		cx: b.cx, cy: b.cy, rx: b.w / 2, ry: b.h / 2,
		stroke: shape.color, 'stroke-width': '3', fill: 'none'
	});
	group.appendChild(visibleElement);
	}

	const handleElements = createResizeHandles(shape, group);
	const shapeRefs = { hitArea, visibleElement, visibleLine, arrowHead, group, handles: handleElements };

	// --- リサイズ ---
	let isResizingShape = false;
	let resizeXField = null;
	let resizeYField = null;
	let resizeStartX = 0;
	let resizeStartY = 0;
	let resizeOrigStartX = 0;
	let resizeOrigStartY = 0;
	let resizeOrigEndX = 0;
	let resizeOrigEndY = 0;

	function handleResizeStart(pageX, pageY, xField, yField) {
	isResizingShape = true;
	resizeXField = xField;
	resizeYField = yField;
	resizeStartX = pageX;
	resizeStartY = pageY;
	resizeOrigStartX = shape.startX;
	resizeOrigStartY = shape.startY;
	resizeOrigEndX = shape.endX;
	resizeOrigEndY = shape.endY;
	group.style.opacity = '0.7';
	selectedShapeId = shape.id;
	highlightSelectedShape();
	}

	function handleResizeMove(pageX, pageY) {
	if (!isResizingShape) return;
	const dx = pageX - resizeStartX;
	const dy = pageY - resizeStartY;
	shape.startX = resizeOrigStartX;
	shape.startY = resizeOrigStartY;
	shape.endX = resizeOrigEndX;
	shape.endY = resizeOrigEndY;
	shape[resizeXField] += dx;
	shape[resizeYField] += dy;
	updateShapeVisuals(shape, shapeRefs);
	}

	async function handleResizeEnd() {
	if (!isResizingShape) return;
	isResizingShape = false;
	group.style.opacity = '1';
	renderAllShapes();
	await saveAllData();
	}

	handleElements.forEach(handle => {
	const xField = handle.getAttribute('data-handle-x-field');
	const yField = handle.getAttribute('data-handle-y-field');

	handle.addEventListener('mousedown', (e) => {
		e.stopPropagation();
		e.preventDefault();
		handleResizeStart(e.pageX, e.pageY, xField, yField);
	});

	handle.addEventListener('touchstart', (e) => {
		e.stopPropagation();
		e.preventDefault();
		const touch = e.touches[0];
		handleResizeStart(touch.pageX, touch.pageY, xField, yField);
	}, { passive: false });
	});

	document.addEventListener('mousemove', (e) => handleResizeMove(e.pageX, e.pageY));
	document.addEventListener('mouseup', () => handleResizeEnd());
	document.addEventListener('touchmove', (e) => {
	if (!isResizingShape) return;
	e.preventDefault();
	const touch = e.touches[0];
	handleResizeMove(touch.pageX, touch.pageY);
	}, { passive: false });
	document.addEventListener('touchend', () => handleResizeEnd());

	// --- ドラッグ移動 ---
	let isDraggingShape = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let hasDragged = false;

	function handleDragStart(pageX, pageY) {
	if (isResizingShape) return;
	isDraggingShape = true;
	hasDragged = false;
	dragStartX = pageX;
	dragStartY = pageY;
	group.style.opacity = '0.7';
	selectedShapeId = shape.id;
	highlightSelectedShape();
	}

	function handleDragMove(pageX, pageY) {
	if (!isDraggingShape) return;
	const dx = pageX - dragStartX;
	const dy = pageY - dragStartY;
	if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
		hasDragged = true;
	}
	group.setAttribute('transform', `translate(${dx}, ${dy})`);
	}

	async function handleDragEnd(pageX, pageY) {
	if (!isDraggingShape) return;
	isDraggingShape = false;
	group.style.opacity = '1';

	if (hasDragged) {
		const dx = pageX - dragStartX;
		const dy = pageY - dragStartY;
		shape.startX += dx;
		shape.startY += dy;
		shape.endX += dx;
		shape.endY += dy;
		renderAllShapes();
		await saveAllData();
	}
	}

	group.addEventListener('mousedown', (e) => {
	if (isResizingShape) return;
	e.stopPropagation();
	e.preventDefault();
	handleDragStart(e.pageX, e.pageY);
	});
	document.addEventListener('mousemove', (e) => handleDragMove(e.pageX, e.pageY));
	document.addEventListener('mouseup', (e) => handleDragEnd(e.pageX, e.pageY));

	group.addEventListener('touchstart', (e) => {
	if (isResizingShape) return;
	e.stopPropagation();
	e.preventDefault();
	const touch = e.touches[0];
	handleDragStart(touch.pageX, touch.pageY);
	}, { passive: false });
	document.addEventListener('touchmove', (e) => {
	if (!isDraggingShape) return;
	e.preventDefault();
	const touch = e.touches[0];
	handleDragMove(touch.pageX, touch.pageY);
	}, { passive: false });
	document.addEventListener('touchend', (e) => {
	if (!isDraggingShape) return;
	const touch = e.changedTouches[0];
	handleDragEnd(touch.pageX, touch.pageY);
	});

	// ホバーで選択（PC用）
	group.addEventListener('mouseenter', () => {
	selectedShapeId = shape.id;
	highlightSelectedShape();
	});

	group.addEventListener('mouseleave', () => {
	if (selectedShapeId === shape.id && !isDraggingShape && !isResizingShape) {
		selectedShapeId = null;
		highlightSelectedShape();
	}
	});

	svg.appendChild(group);
	return group;
}

function highlightSelectedShape() {
	document.querySelectorAll('.comemo-shape').forEach(el => {
	if (el.getAttribute('data-shape-id') === selectedShapeId) {
		el.classList.add('comemo-shape-selected');
	} else {
		el.classList.remove('comemo-shape-selected');
	}
	});
}

function setupShapeKeyboardEvents() {
	document.addEventListener('keydown', (e) => {
	if (!selectedShapeId) return;
	if (e.key === 'Delete' || e.key === 'Backspace') {
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
		return;
		}
		e.preventDefault();
		deleteShape(selectedShapeId);
		selectedShapeId = null;
	}
	});
}

async function deleteShape(id) {
	const deleted = shapes.find(s => s.id === id);
	if (deleted) {
	undoStack.push({ type: 'shape', data: JSON.parse(JSON.stringify(deleted)) });
	}
	shapes = shapes.filter(s => s.id !== id);
	const el = document.querySelector(`[data-shape-id="${id}"]`);
	if (el) el.remove();
	await saveAllData();
	showTimedNotification('図形を削除しました（Ctrl+Zで元に戻す）', NOTIFY_LONG);
}

async function undoLastAction() {
	if (undoStack.length === 0) return;
	const action = undoStack.pop();
	if (action.type === 'memo') {
	memos.push(action.data);
	const container = createMemoContainer();
	const memoEl = createMemoElement(action.data, true);
	container.appendChild(memoEl);
	await saveAllMemos();
	updatePanelCount();
	showTimedNotification('メモを元に戻しました');
	} else if (action.type === 'shape') {
	shapes.push(action.data);
	createShapeElement(action.data);
	await saveAllData();
	showTimedNotification('図形を元に戻しました');
	}
}

function setupUndoKeyboard() {
	document.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
		return;
		}
		if (undoStack.length > 0) {
		e.preventDefault();
		undoLastAction();
		}
	}
	});
}

function renderAllShapes() {
	const svg = createSvgContainer();
	svg.innerHTML = '';
	shapes.forEach(shape => {
	createShapeElement(shape);
	});
}

// ============================================
// 図形: 描画モード
// ============================================

function startDrawingMode(tool) {
	isDrawingMode = true;
	currentDrawingTool = tool;
	document.body.style.cursor = 'crosshair';

	const svg = createSvgContainer();
	svg.setAttribute('pointer-events', 'all');

	showNotification(`${getToolName(tool)}を描画中... ドラッグで描画、ESCでキャンセル`);
}

function stopDrawingMode() {
	isDrawingMode = false;
	currentDrawingTool = null;
	isDrawing = false;
	document.body.style.cursor = '';

	const svg = document.getElementById('comemo-svg-container');
	if (svg) {
	svg.setAttribute('pointer-events', 'none');
	}

	if (currentPreviewShape) {
	currentPreviewShape.remove();
	currentPreviewShape = null;
	}

	hideNotification();
	updateDrawingToolbar();
}

function getToolName(tool) {
	switch (tool) {
	case 'arrow': return '矢印';
	case 'rect': return '四角';
	case 'ellipse': return '丸';
	default: return '図形';
	}
}

function updateDrawingToolbar() {
	if (!panelElement) return;

	panelElement.querySelectorAll('.comemo-drawing-tool').forEach(btn => {
	if (isDrawingMode && btn.dataset.tool === currentDrawingTool) {
		btn.classList.add('comemo-drawing-tool-active');
	} else {
		btn.classList.remove('comemo-drawing-tool-active');
	}
	});
}

function createPreviewShape(shape, svg) {
	let element;

	if (shape.type === 'arrow') {
	const group = svgEl('g', { class: 'comemo-shape-preview' });

	const line = svgEl('line', {
		x1: shape.startX, y1: shape.startY, x2: shape.endX, y2: shape.endY,
		stroke: shape.color, 'stroke-width': '3', 'stroke-dasharray': '5,5'
	});

	const polygon = svgEl('polygon', {
		points: calcArrowPoints(shape.startX, shape.startY, shape.endX, shape.endY), fill: shape.color, opacity: '0.5'
	});

	group.appendChild(line);
	group.appendChild(polygon);
	element = group;

	} else if (shape.type === 'rect') {
	const b = getShapeBounds(shape);
	element = svgEl('rect', {
		class: 'comemo-shape-preview',
		x: b.x, y: b.y, width: b.w, height: b.h,
		stroke: shape.color, 'stroke-width': '3', 'stroke-dasharray': '5,5', fill: 'none'
	});

	} else if (shape.type === 'ellipse') {
	const b = getShapeBounds(shape);
	element = svgEl('ellipse', {
		class: 'comemo-shape-preview',
		cx: b.cx, cy: b.cy, rx: b.w / 2, ry: b.h / 2,
		stroke: shape.color, 'stroke-width': '3', 'stroke-dasharray': '5,5', fill: 'none'
	});
	}

	if (element) {
	svg.appendChild(element);
	}

	return element;
}

function setupDrawingEvents() {
	function handleDrawStart(pageX, pageY, target) {
	if (!isDrawingMode || !currentDrawingTool) return false;
	if (target.closest('#comemo-panel')) return false;
	if (target.closest('.comemo-shape')) return false;

	isDrawing = true;
	drawStartX = pageX;
	drawStartY = pageY;
	return true;
	}

	function handleDrawMove(pageX, pageY) {
	if (!isDrawing) return;
	const svg = createSvgContainer();
	if (currentPreviewShape) {
		currentPreviewShape.remove();
	}
	const previewShape = {
		id: 'preview',
		type: currentDrawingTool,
		startX: drawStartX,
		startY: drawStartY,
		endX: pageX,
		endY: pageY,
		color: currentShapeColor
	};
	currentPreviewShape = createPreviewShape(previewShape, svg);
	}

	async function handleDrawEnd(pageX, pageY) {
	if (!isDrawing) return;
	isDrawing = false;

	if (currentPreviewShape) {
		currentPreviewShape.remove();
		currentPreviewShape = null;
	}

	const dx = Math.abs(pageX - drawStartX);
	const dy = Math.abs(pageY - drawStartY);
	if (dx < 10 && dy < 10) return;

	const shape = {
		id: generateId(),
		type: currentDrawingTool,
		startX: drawStartX,
		startY: drawStartY,
		endX: pageX,
		endY: pageY,
		color: currentShapeColor,
		created_at: new Date().toISOString()
	};

	shapes.push(shape);
	createShapeElement(shape);
	await saveAllData();
	stopDrawingMode();
	showTimedNotification('図形を追加しました');
	}

	// マウスイベント
	document.addEventListener('mousedown', (e) => {
	if (handleDrawStart(e.pageX, e.pageY, e.target)) {
		e.preventDefault();
	}
	});
	document.addEventListener('mousemove', (e) => handleDrawMove(e.pageX, e.pageY));
	document.addEventListener('mouseup', (e) => handleDrawEnd(e.pageX, e.pageY));

	// タッチイベント
	document.addEventListener('touchstart', (e) => {
	const touch = e.touches[0];
	if (handleDrawStart(touch.pageX, touch.pageY, e.target)) {
		e.preventDefault();
	}
	}, { passive: false });
	document.addEventListener('touchmove', (e) => {
	if (!isDrawing) return;
	e.preventDefault();
	const touch = e.touches[0];
	handleDrawMove(touch.pageX, touch.pageY);
	}, { passive: false });
	document.addEventListener('touchend', (e) => {
	if (!isDrawing) return;
	const touch = e.changedTouches[0];
	handleDrawEnd(touch.pageX, touch.pageY);
	});

	// ESCキーでキャンセル
	document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && isDrawingMode) {
		stopDrawingMode();
	}
	});
}

// ============================================
// メモ: コメント
// ============================================

function createCommentElement(comment) {
	const el = document.createElement('div');
	el.className = 'comemo-comment';
	el.innerHTML = `
	<span class="comemo-comment-content">${escapeHtml(comment.content)}</span>
	`;
	return el;
}

function createCommentsSection(memo) {
	const section = document.createElement('div');
	section.className = 'comemo-comments-section';

	// トグルヘッダー
	const toggle = document.createElement('div');
	toggle.className = 'comemo-comments-toggle';

	const arrow = document.createElement('span');
	arrow.className = 'comemo-comments-toggle-arrow';
	arrow.textContent = '\u25B6';

	const toggleLabel = document.createElement('span');
	toggleLabel.className = 'comemo-comments-toggle-label';
	const commentCount = (memo.comments && memo.comments.length) || 0;
	toggleLabel.textContent = commentCount > 0 ? `コメント (${commentCount})` : 'コメント';

	toggle.appendChild(arrow);
	toggle.appendChild(toggleLabel);
	section.appendChild(toggle);

	// 折りたたみ本体
	const body = document.createElement('div');
	body.className = 'comemo-comments-body';

	const commentsList = document.createElement('div');
	commentsList.className = 'comemo-comments-list';
	commentsList.dataset.memoId = memo.id;

	if (memo.comments && memo.comments.length > 0) {
	memo.comments.forEach(comment => {
		const commentEl = createCommentElement(comment);
		commentsList.appendChild(commentEl);
	});
	}
	body.appendChild(commentsList);

	const commentArea = document.createElement('div');
	commentArea.className = 'comemo-comment-area';

	const inputContainer = document.createElement('div');
	inputContainer.className = 'comemo-comment-input-container';

	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'comemo-comment-input';
	input.placeholder = 'コメントを追加...';

	const submitBtn = document.createElement('button');
	submitBtn.className = 'comemo-comment-submit';
	submitBtn.textContent = '送信';
	submitBtn.onclick = async () => {
	if (input.value.trim()) {
		await addComment(memo.id, input.value.trim());
		input.value = '';
		// コメント数を更新
		const count = (memo.comments && memo.comments.length) || 0;
		toggleLabel.textContent = count > 0 ? `コメント (${count})` : 'コメント';
	}
	};

	input.addEventListener('keypress', (e) => {
	if (e.key === 'Enter' && input.value.trim()) {
		submitBtn.click();
	}
	});

	inputContainer.appendChild(input);
	inputContainer.appendChild(submitBtn);
	commentArea.appendChild(inputContainer);
	body.appendChild(commentArea);
	section.appendChild(body);

	// トグル動作
	toggle.addEventListener('click', () => {
	const isOpen = body.classList.contains('comemo-comments-body-open');
	if (isOpen) {
		body.classList.remove('comemo-comments-body-open');
		arrow.textContent = '\u25B6';
	} else {
		body.classList.add('comemo-comments-body-open');
		arrow.textContent = '\u25BC';
	}
	});

	return section;
}

// ============================================
// メモ: 要素作成
// ============================================

function createMemoElement(memo, isOwner = true) {
	const memoEl = document.createElement('div');
	memoEl.className = 'comemo-memo';
	memoEl.dataset.id = memo.id;
	memoEl.style.left = memo.position_x + 'px';
	memoEl.style.top = memo.position_y + 'px';
	memoEl.dataset.color = memo.color || 'default';

	// 縮小時のキャラクター
	const miniCharacter = document.createElement('div');
	miniCharacter.className = 'comemo-memo-mini-character';
	miniCharacter.innerHTML = `<img src="${chrome.runtime.getURL('assets/icons/cocome_300px.png')}" alt="展開" title="クリックで展開 / ドラッグで移動">`;
	memoEl.appendChild(miniCharacter);

	// メモ本体コンテナ
	const memoBody = document.createElement('div');
	memoBody.className = 'comemo-memo-body';

	// ヘッダー
	const header = document.createElement('div');
	header.className = 'comemo-memo-header';

	const buttonsContainer = document.createElement('div');
	buttonsContainer.className = 'comemo-memo-buttons';

	const minimizeBtn = document.createElement('button');
	minimizeBtn.className = 'comemo-memo-minimize';
	minimizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path></svg>';
	minimizeBtn.title = '縮小';
	minimizeBtn.onclick = (e) => {
	e.stopPropagation();
	memoEl.classList.add('comemo-memo-minimized');
	};
	buttonsContainer.appendChild(minimizeBtn);

	const shareBtn = document.createElement('button');
	shareBtn.className = 'comemo-memo-share';
	shareBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
	shareBtn.title = '共有リンクをコピー';
	shareBtn.onclick = async (e) => {
	e.stopPropagation();
	const url = await generateShareUrl();
	await navigator.clipboard.writeText(url);
	showTimedNotification('共有リンクをコピーしました');
	};
	buttonsContainer.appendChild(shareBtn);

	const deleteBtn = document.createElement('button');
	deleteBtn.className = 'comemo-memo-delete';
	deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
	deleteBtn.title = 'このメモを削除';
	deleteBtn.onclick = (e) => {
	e.stopPropagation();
	if (confirm('このメモを削除しますか？')) {
		deleteMemo(memo.id);
	}
	};
	buttonsContainer.appendChild(deleteBtn);
	header.appendChild(buttonsContainer);
	memoBody.appendChild(header);

	// 入力エリア
	const inputArea = document.createElement('div');
	inputArea.className = 'comemo-memo-input-area';

	const textarea = document.createElement('textarea');
	textarea.className = 'comemo-memo-textarea';
	textarea.placeholder = 'ここに入力してください...';
	textarea.value = memo.content || '';

	if (isOwner) {
	textarea.addEventListener('input', () => {
		memo.content = textarea.value;
		saveMemoContent(memo);
	});

	const submitBtn = document.createElement('button');
	submitBtn.className = 'comemo-memo-submit';
	submitBtn.textContent = '保存';
	submitBtn.onclick = async () => {
		memo.content = textarea.value;
		await saveMemoContent(memo);
		showTimedNotification('保存しました');
	};

	inputArea.appendChild(textarea);
	inputArea.appendChild(submitBtn);
	} else {
	textarea.readOnly = true;
	inputArea.appendChild(textarea);
	}

	memoBody.appendChild(inputArea);

	// コメントセクション
	const commentsSection = createCommentsSection(memo);
	memoBody.appendChild(commentsSection);

	memoEl.appendChild(memoBody);

	if (isOwner) {
	makeDraggable(memoEl, memo);
	}

	return memoEl;
}

// ============================================
// メモ: ドラッグ
// ============================================

function makeDraggable(element, memo) {
	const header = element.querySelector('.comemo-memo-header');
	const miniCharacter = element.querySelector('.comemo-memo-mini-character');
	let isDragging = false;
	let hasMoved = false;
	let startX, startY, initialX, initialY;

	function handleStart(clientX, clientY, target) {
	if (target.closest('.comemo-memo-delete')) return false;
	if (target.closest('.comemo-memo-minimize')) return false;
	if (target.closest('.comemo-memo-share')) return false;
	isDragging = true;
	hasMoved = false;
	startX = clientX;
	startY = clientY;
	initialX = element.offsetLeft;
	initialY = element.offsetTop;
	element.classList.add('comemo-dragging');
	return true;
	}

	function handleMove(clientX, clientY) {
	if (!isDragging) return;
	const dx = clientX - startX;
	const dy = clientY - startY;
	if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
		hasMoved = true;
	}
	element.style.left = (initialX + dx) + 'px';
	element.style.top = (initialY + dy) + 'px';
	}

	function handleEnd() {
	if (!isDragging) return;
	isDragging = false;
	element.classList.remove('comemo-dragging');

	if (!hasMoved && element.classList.contains('comemo-memo-minimized')) {
		element.classList.remove('comemo-memo-minimized');
	} else if (hasMoved) {
		memo.position_x = element.offsetLeft;
		memo.position_y = element.offsetTop;
		saveMemoPosition(memo);
	}
	}

	function startDrag(e) {
	if (handleStart(e.clientX, e.clientY, e.target)) {
		e.preventDefault();
	}
	}
	header.addEventListener('mousedown', startDrag);
	miniCharacter.addEventListener('mousedown', startDrag);
	document.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
	document.addEventListener('mouseup', handleEnd);

	function startTouchDrag(e) {
	const touch = e.touches[0];
	if (handleStart(touch.clientX, touch.clientY, e.target)) {
		e.preventDefault();
	}
	}
	header.addEventListener('touchstart', startTouchDrag, { passive: false });
	miniCharacter.addEventListener('touchstart', startTouchDrag, { passive: false });
	document.addEventListener('touchmove', (e) => {
	if (!isDragging) return;
	e.preventDefault();
	const touch = e.touches[0];
	handleMove(touch.clientX, touch.clientY);
	}, { passive: false });
	document.addEventListener('touchend', handleEnd);
}

// ============================================
// メモ: 操作
// ============================================

async function addMemoAtCenter() {
	console.log('[CoMemo] Adding memo at center');

	const centerX = window.scrollX + (window.innerWidth / 2) - 140;
	const centerY = window.scrollY + (window.innerHeight / 2) - 60;

	const memo = {
	id: generateId(),
	position_x: centerX,
	position_y: centerY,
	content: '',
	color: 'default',
	comments: [],
	created_at: new Date().toISOString()
	};

	memos.push(memo);
	const container = createMemoContainer();
	const memoEl = createMemoElement(memo, true);
	container.appendChild(memoEl);

	setTimeout(() => {
	const textarea = memoEl.querySelector('.comemo-memo-textarea');
	if (textarea) textarea.focus();
	}, 100);

	await saveAllMemos();
	updatePanelCount();
	showTimedNotification('メモを追加しました');
}

async function deleteMemo(id) {
	const deleted = memos.find(m => m.id === id);
	if (deleted) {
	undoStack.push({ type: 'memo', data: JSON.parse(JSON.stringify(deleted)) });
	}
	memos = memos.filter(m => m.id !== id);
	const el = document.querySelector(`.comemo-memo[data-id="${id}"]`);
	if (el) el.remove();
	await saveAllMemos();
	updatePanelCount();
	showTimedNotification('メモを削除しました（Ctrl+Zで元に戻す）', NOTIFY_LONG);
}

async function addComment(memoId, content) {
	const comment = {
	id: generateId(),
	memo_id: memoId,
	content: content,
	created_at: new Date().toISOString()
	};

	const memo = memos.find(m => m.id === memoId);
	if (memo) {
	if (!memo.comments) memo.comments = [];
	memo.comments.push(comment);
	}

	const commentsList = document.querySelector(`.comemo-comments-list[data-memo-id="${memoId}"]`);
	if (commentsList) {
	const commentEl = createCommentElement(comment);
	commentsList.appendChild(commentEl);
	}

	if (supabase && currentCollectionId) {
	try {
		await supabase
		.from('comments')
		.insert({
			memo_id: memoId,
			content: content
		});
	} catch (error) {
		console.error('コメント保存エラー:', error);
	}
	}

	await saveToLocal();
}

function renderAllMemos(isOwner = true) {
	const container = createMemoContainer();
	container.innerHTML = '';

	memos.forEach(memo => {
	const memoEl = createMemoElement(memo, isOwner);
	container.appendChild(memoEl);
	});
}

// ============================================
// スクリーンショット
// ============================================

function hideComemoUI() {
	const elements = [];
	if (panelElement) {
	elements.push({ el: panelElement, orig: panelElement.style.display });
	panelElement.style.display = 'none';
	}
	const notif = document.getElementById('comemo-notification');
	if (notif) {
	elements.push({ el: notif, orig: notif.style.display });
	notif.style.display = 'none';
	}
	return elements;
}

function showComemoUI(elements) {
	elements.forEach(({ el, orig }) => {
	el.style.display = orig;
	});
}

function requestCapture() {
	return new Promise((resolve, reject) => {
	chrome.runtime.sendMessage({ action: 'captureVisibleTab' }, (response) => {
		if (chrome.runtime.lastError) {
		reject(chrome.runtime.lastError);
		} else if (response && response.dataUrl) {
		resolve(response.dataUrl);
		} else {
		reject(new Error('キャプチャ失敗'));
		}
	});
	});
}

function loadImage(src) {
	return new Promise((resolve, reject) => {
	const img = new Image();
	img.onload = () => resolve(img);
	img.onerror = reject;
	img.src = src;
	});
}

function downloadDataUrl(dataUrl, filename) {
	const a = document.createElement('a');
	a.href = dataUrl;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

async function captureVisibleScreenshot() {
	const btn = panelElement && panelElement.querySelector('#comemo-ss-visible');
	if (btn) { btn.disabled = true; btn.textContent = '...'; }
	const hidden = hideComemoUI();
	await new Promise(r => setTimeout(r, 100));
	try {
	const dataUrl = await requestCapture();
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	downloadDataUrl(dataUrl, `comemo-visible-${timestamp}.png`);
	showTimedNotification('スクリーンショットを保存しました');
	} catch (error) {
	console.error('[CoMemo] スクショエラー:', error);
	showTimedNotification('スクリーンショット失敗');
	} finally {
	showComemoUI(hidden);
	if (btn) { btn.disabled = false; btn.textContent = '表示範囲'; }
	}
}

function neutralizeFixedElements() {
	const fixed = [];
	const allElements = document.querySelectorAll('*');
	allElements.forEach(el => {
	if (el.id && el.id.startsWith('comemo')) return;
	const style = window.getComputedStyle(el);
	if (style.position === 'fixed' || style.position === 'sticky') {
		fixed.push({ el, origPosition: el.style.position, origTop: el.style.top });
		el.style.position = 'absolute';
	}
	});
	return fixed;
}

function restoreFixedElements(fixed) {
	fixed.forEach(({ el, origPosition, origTop }) => {
	el.style.position = origPosition;
	el.style.top = origTop;
	});
}

async function captureFullPageScreenshot() {
	const btn = panelElement && panelElement.querySelector('#comemo-ss-full');
	if (btn) { btn.disabled = true; btn.textContent = '撮影中...'; }
	const dpr = window.devicePixelRatio || 1;
	const origScrollX = window.scrollX;
	const origScrollY = window.scrollY;

	const hidden = hideComemoUI();
	const fixedElements = neutralizeFixedElements();

	// scroll-behavior: smooth を一時的に無効化（scrollToが即座に完了するように）
	const origScrollBehavior = document.documentElement.style.scrollBehavior;
	document.documentElement.style.scrollBehavior = 'auto';

	const origOverflow = document.documentElement.style.overflow;
	document.documentElement.style.overflow = 'hidden';

	// neutralize後にページサイズを正確に測定
	const scrollWidth = Math.max(
	document.documentElement.scrollWidth,
	document.body.scrollWidth,
	document.documentElement.offsetWidth,
	document.body.offsetWidth
	);
	const scrollHeight = Math.max(
	document.documentElement.scrollHeight,
	document.body.scrollHeight,
	document.documentElement.offsetHeight,
	document.body.offsetHeight
	);
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	// SVGコンテナを現在のページサイズに合わせる
	const svg = document.getElementById('comemo-svg-container');
	let origSvgWidth, origSvgHeight;
	if (svg) {
	origSvgWidth = svg.style.width;
	origSvgHeight = svg.style.height;
	svg.style.width = scrollWidth + 'px';
	svg.style.height = scrollHeight + 'px';
	}

	await new Promise(r => setTimeout(r, 150));

	try {
	// Canvasサイズ制限チェック (Chrome: ~16384px per dim, ~268M total pixels)
	const canvasW = viewportWidth * dpr;
	const canvasH = scrollHeight * dpr;
	const MAX_DIM = 16384;
	const MAX_PIXELS = 268435456;
	if (canvasW > MAX_DIM || canvasH > MAX_DIM || canvasW * canvasH > MAX_PIXELS) {
		throw new Error(`ページが大きすぎます (${Math.round(canvasW)}×${Math.round(canvasH)}px)`);
	}

	const canvas = document.createElement('canvas');
	canvas.width = canvasW;
	canvas.height = canvasH;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas context取得失敗');

	// キャプチャ回数を計算
	const numCaptures = Math.ceil(scrollHeight / viewportHeight);

	for (let i = 0; i < numCaptures; i++) {
		if (btn) btn.textContent = `${i + 1}/${numCaptures}`;

		const isLast = (i === numCaptures - 1);
		let scrollY;
		if (!isLast) {
		scrollY = i * viewportHeight;
		} else {
		// 最終セグメント: ページ末尾が見えるようにスクロール
		scrollY = Math.max(0, scrollHeight - viewportHeight);
		}

		// instant指定でスクロール（smooth scrollを確実に回避）
		window.scrollTo({ left: 0, top: scrollY, behavior: 'instant' });
		// レンダリング完了を待つ: requestAnimationFrame + setTimeout
		await new Promise(r => requestAnimationFrame(() => setTimeout(r, 300)));

		const dataUrl = await requestCapture();
		const img = await loadImage(dataUrl);

		// 実際のキャプチャ画像サイズを取得
		const imgW = img.naturalWidth;
		const imgH = img.naturalHeight;

		if (isLast && numCaptures > 1 && scrollHeight % viewportHeight !== 0) {
		// 最終セグメント: 重複部分をクロップし、新しい部分のみ描画
		const prevEnd = i * viewportHeight;
		const overlapCSS = prevEnd - scrollY;
		const overlapPx = Math.round(overlapCSS * (imgH / viewportHeight));
		const srcH = imgH - overlapPx;
		const dstY = Math.round(prevEnd * dpr);
		ctx.drawImage(img,
			0, overlapPx, imgW, srcH,
			0, dstY, imgW, srcH
		);
		} else {
		// 通常セグメント: 画像全体をスクロール位置に描画
		ctx.drawImage(img, 0, Math.round(scrollY * dpr));
		}
	}

	// toBlob() で保存（toDataURL より大幅にメモリ効率が良い）
	const blob = await new Promise((resolve, reject) => {
		canvas.toBlob(
		b => b ? resolve(b) : reject(new Error('Blob生成失敗')),
		'image/png'
		);
	});
	const blobUrl = URL.createObjectURL(blob);
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const a = document.createElement('a');
	a.href = blobUrl;
	a.download = `comemo-fullpage-${timestamp}.png`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

	showTimedNotification('全体スクリーンショットを保存しました');
	} catch (error) {
	console.error('[CoMemo] 全体SSエラー:', error);
	showTimedNotification('全体スクリーンショット失敗: ' + error.message, NOTIFY_LONG);
	} finally {
	document.documentElement.style.overflow = origOverflow;
	document.documentElement.style.scrollBehavior = origScrollBehavior;
	window.scrollTo({ left: origScrollX, top: origScrollY, behavior: 'instant' });
	if (svg) {
		svg.style.width = origSvgWidth;
		svg.style.height = origSvgHeight;
	}
	restoreFixedElements(fixedElements);
	showComemoUI(hidden);
	if (btn) { btn.disabled = false; btn.textContent = '全体'; }
	}
}

// ============================================
// フローティングパネル
// ============================================

function makePanelDraggable(panel) {
	const header = panel.querySelector('.comemo-panel-header');
	let isDragging = false;
	let startX, startY, initialLeft, initialTop;

	function initPosition() {
	if (panel.style.right && !panel.style.left) {
		const rect = panel.getBoundingClientRect();
		panel.style.left = rect.left + 'px';
		panel.style.top = rect.top + 'px';
		panel.style.right = 'auto';
	}
	}

	function handleStart(clientX, clientY, target) {
	if (target.closest('.comemo-panel-minimize') || target.closest('.comemo-panel-close')) return false;
	initPosition();
	isDragging = true;
	startX = clientX;
	startY = clientY;
	initialLeft = panel.offsetLeft;
	initialTop = panel.offsetTop;
	panel.style.transition = 'none';
	return true;
	}

	function handleMove(clientX, clientY) {
	if (!isDragging) return;
	const dx = clientX - startX;
	const dy = clientY - startY;
	const newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, initialLeft + dx));
	const newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, initialTop + dy));
	panel.style.left = newLeft + 'px';
	panel.style.top = newTop + 'px';
	}

	function handleEnd() {
	if (!isDragging) return;
	isDragging = false;
	panel.style.transition = '';
	}

	header.style.cursor = 'grab';

	header.addEventListener('mousedown', (e) => {
	if (handleStart(e.clientX, e.clientY, e.target)) {
		e.preventDefault();
		header.style.cursor = 'grabbing';
	}
	});
	document.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
	document.addEventListener('mouseup', () => { handleEnd(); header.style.cursor = 'grab'; });

	header.addEventListener('touchstart', (e) => {
	const touch = e.touches[0];
	if (handleStart(touch.clientX, touch.clientY, e.target)) {
		e.preventDefault();
	}
	}, { passive: false });
	document.addEventListener('touchmove', (e) => {
	if (!isDragging) return;
	e.preventDefault();
	const touch = e.touches[0];
	handleMove(touch.clientX, touch.clientY);
	}, { passive: false });
	document.addEventListener('touchend', () => handleEnd());
}

function createPanel() {
	if (panelElement) return panelElement;

	panelElement = document.createElement('div');
	panelElement.id = 'comemo-panel';
	panelElement.innerHTML = `
	<div class="comemo-panel-header">
		<div class="comemo-panel-title-wrapper">
		<img src="${chrome.runtime.getURL('assets/icons/icon_64px.png')}" alt="CoMemo" class="comemo-panel-logo">
		<span class="comemo-panel-title">CoMemo</span>
		</div>
		<div class="comemo-panel-header-buttons">
		<button class="comemo-panel-minimize" title="縮小">−</button>
		<button class="comemo-panel-close" title="閉じる">×</button>
		</div>
	</div>
	<div class="comemo-panel-body">
		<div class="comemo-panel-status">
		<span class="comemo-panel-count">${memos.length}</span>
		<span class="comemo-panel-label">このページのメモ</span>
		</div>
		<div class="comemo-panel-section">
		<label class="comemo-panel-input-label">図形マーキング</label>
		<div class="comemo-drawing-toolbar">
			<button class="comemo-drawing-tool" data-tool="arrow" title="矢印">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="5" y1="19" x2="19" y2="5"></line>
				<polyline points="19 12 19 5 12 5"></polyline>
			</svg>
			</button>
			<button class="comemo-drawing-tool" data-tool="rect" title="四角">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
			</svg>
			</button>
			<button class="comemo-drawing-tool" data-tool="ellipse" title="丸">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<ellipse cx="12" cy="12" rx="8" ry="8"></ellipse>
			</svg>
			</button>
			<div class="comemo-drawing-divider"></div>
			<div class="comemo-color-picker">
			<button class="comemo-color-btn comemo-color-btn-active" data-color="#e53935" style="background:#e53935" title="赤"></button>
			<button class="comemo-color-btn" data-color="#1e88e5" style="background:#1e88e5" title="青"></button>
			<button class="comemo-color-btn" data-color="#43a047" style="background:#43a047" title="緑"></button>
			<button class="comemo-color-btn" data-color="#f9a825" style="background:#f9a825" title="黄色"></button>
			</div>
		</div>
		</div>
		<div class="comemo-panel-section">
		<label class="comemo-panel-input-label">スクリーンショット</label>
		<div class="comemo-screenshot-toolbar">
			<button class="comemo-panel-btn comemo-panel-btn-ss" id="comemo-ss-visible">表示範囲</button>
			<button class="comemo-panel-btn comemo-panel-btn-ss" id="comemo-ss-full">全体</button>
		</div>
		</div>
		<div class="comemo-panel-buttons">
		<button class="comemo-panel-btn comemo-panel-btn-primary" id="comemo-add-btn">メモを追加</button>
		<button class="comemo-panel-btn comemo-panel-btn-secondary" id="comemo-share-btn">共有URLをコピー</button>
		<button class="comemo-panel-btn comemo-panel-btn-danger" id="comemo-clear-btn">全てのメモを削除</button>
		</div>
	</div>
	`;

	document.body.appendChild(panelElement);

	panelElement.querySelector('.comemo-panel-close').addEventListener('click', hidePanel);

	panelElement.querySelector('.comemo-panel-minimize').addEventListener('click', () => {
	panelElement.classList.toggle('comemo-panel-minimized');
	const btn = panelElement.querySelector('.comemo-panel-minimize');
	if (panelElement.classList.contains('comemo-panel-minimized')) {
		btn.textContent = '+';
		btn.title = '拡大';
	} else {
		btn.textContent = '−';
		btn.title = '縮小';
	}
	});

	panelElement.querySelector('#comemo-add-btn').addEventListener('click', () => {
	addMemoAtCenter();
	});

	panelElement.querySelector('#comemo-share-btn').addEventListener('click', async () => {
	const url = await generateShareUrl();
	await navigator.clipboard.writeText(url);
	showTimedNotification('共有リンクをコピーしました');
	});

	panelElement.querySelector('#comemo-clear-btn').addEventListener('click', () => {
	if (confirm('全てのメモを削除しますか？')) {
		memos = [];
		shapes = [];
		currentShareCode = null;
		currentCollectionId = null;
		renderAllMemos(true);
		renderAllShapes();
		saveToLocal();
		updatePanelCount();
		showTimedNotification('メモと図形を削除しました');
	}
	});

	panelElement.querySelectorAll('.comemo-drawing-tool').forEach(btn => {
	btn.addEventListener('click', () => {
		const tool = btn.dataset.tool;
		if (isDrawingMode && currentDrawingTool === tool) {
		stopDrawingMode();
		} else {
		startDrawingMode(tool);
		updateDrawingToolbar();
		}
	});
	});

	panelElement.querySelectorAll('.comemo-color-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		currentShapeColor = btn.dataset.color;
		panelElement.querySelectorAll('.comemo-color-btn').forEach(b => b.classList.remove('comemo-color-btn-active'));
		btn.classList.add('comemo-color-btn-active');
	});
	});

	panelElement.querySelector('#comemo-ss-visible').addEventListener('click', captureVisibleScreenshot);
	panelElement.querySelector('#comemo-ss-full').addEventListener('click', captureFullPageScreenshot);

	makePanelDraggable(panelElement);

	return panelElement;
}

function updatePanelCount() {
	if (panelElement) {
	const countEl = panelElement.querySelector('.comemo-panel-count');
	if (countEl) countEl.textContent = memos.length;
	}
}

function showPanel() {
	const panel = createPanel();
	panel.classList.add('comemo-panel-show');
	updatePanelCount();
}

function hidePanel() {
	if (panelElement) {
	panelElement.classList.remove('comemo-panel-show');
	}
}

function togglePanel() {
	if (panelElement && panelElement.classList.contains('comemo-panel-show')) {
	hidePanel();
	} else {
	showPanel();
	}
}

// ============================================
// メッセージ受信
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log('[CoMemo] Message received:', request.action);
	if (request.action === 'ping') {
	sendResponse({ pong: true });
	} else if (request.action === 'togglePanel') {
	togglePanel();
	sendResponse({ success: true });
	} else if (request.action === 'addMemo') {
	addMemoAtCenter();
	sendResponse({ success: true });
	} else if (request.action === 'getShareUrl') {
	generateShareUrl().then(url => {
		sendResponse({ url: url });
	});
	return true;
	} else if (request.action === 'getMemoCount') {
	sendResponse({ count: memos.length });
	} else if (request.action === 'clearMemos') {
	memos = [];
	currentShareCode = null;
	currentCollectionId = null;
	renderAllMemos(true);
	saveToLocal();
	sendResponse({ success: true });
	} else if (request.action === 'getPageDimensions') {
	sendResponse({
		scrollWidth: document.documentElement.scrollWidth,
		scrollHeight: document.documentElement.scrollHeight,
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		dpr: window.devicePixelRatio || 1,
		origScrollX: window.scrollX,
		origScrollY: window.scrollY
	});
	} else if (request.action === 'prepareCapture') {
	document.documentElement.style.overflow = 'hidden';
	sendResponse({ success: true });
	} else if (request.action === 'scrollForCapture') {
	window.scrollTo(request.x, request.y);
	sendResponse({ success: true });
	} else if (request.action === 'finishCapture') {
	document.documentElement.style.overflow = '';
	window.scrollTo(request.x || 0, request.y || 0);
	sendResponse({ success: true });
	} else if (request.action === 'downloadScreenshot') {
	const a = document.createElement('a');
	a.href = request.dataUrl;
	a.download = request.filename || 'comemo-screenshot.png';
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	sendResponse({ success: true });
	}
});

// ============================================
// 初期化
// ============================================

async function init() {
	console.log('[CoMemo] Initializing...');
	initSupabase();

	setupDrawingEvents();
	setupShapeKeyboardEvents();
	setupUndoKeyboard();

	const shareCode = getShareCodeFromUrl();

	if (shareCode) {
	const sharedData = await loadFromSupabase(shareCode);
	if (sharedData) {
		memos = sharedData.memos;
		shapes = sharedData.shapes || [];
		currentCollectionId = sharedData.collection.id;
		currentShareCode = shareCode;
		renderAllMemos(true);
		renderAllShapes();
		const totalCount = memos.length + shapes.length;
		showTimedNotification(`${totalCount}件の共有データを表示中`, NOTIFY_LONG);
	} else {
		// Supabase失敗時：ローカルデータにフォールバック
		const localData = await loadFromLocal();
		if (localData) {
		memos = localData.memos || [];
		shapes = localData.shapes || [];
		currentShareCode = localData.shareCode;
		currentCollectionId = localData.collectionId;
		renderAllMemos(true);
		renderAllShapes();
		}
	}
	} else {
	const localData = await loadFromLocal();
	if (localData) {
		memos = localData.memos || [];
		shapes = localData.shapes || [];
		currentShareCode = localData.shareCode;
		currentCollectionId = localData.collectionId;
		renderAllMemos(true);
		renderAllShapes();
	}
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => init().catch(e => console.warn('[CoMemo] init error:', e)));
} else {
	init().catch(e => console.warn('[CoMemo] init error:', e));
}
})();
