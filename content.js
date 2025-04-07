// content.js

/**
 * @fileoverview 内容脚本 (Content Script)，用于 AI 简历填充助手。
 * 注入到网页中，负责：
 * 1. 提取页面表单信息。
 * 2. 根据后台指令填充表单字段。
 * 3. 通知后台脚本自身已准备就绪 (实现握手)。
 * 4. 响应后台的 ping 请求。
 */

console.log("AI Resume Filler: Content script loaded."); // 调试信息

// --- 辅助函数 (findLabelForElement, getElementValueByPath) ---
// ... (代码保持不变) ...
function findLabelForElement(element) { if (element.labels && element.labels.length > 0) { return Array.from(element.labels).map(label => label.textContent.trim()).join(' '); } if (element.id) { try { const escapedId = CSS.escape(element.id); const labels = document.querySelectorAll(`label[for="${escapedId}"]`); if (labels.length > 0) { return Array.from(labels).map(label => label.textContent.trim()).join(' '); } } catch (e) { console.warn(`查找 Label 时 ID [${element.id}] 无效或出错:`, e); } } let parent = element.parentElement; while (parent) { if (parent.tagName === 'LABEL') { let labelText = parent.textContent.trim(); if(element.value) labelText = labelText.replace(element.value, '').trim(); if(element.textContent) labelText = labelText.replace(element.textContent, '').trim(); return labelText; } if (parent === document.body) break; parent = parent.parentElement; } const prevSibling = element.previousElementSibling; if (prevSibling && prevSibling.tagName === 'LABEL') { return prevSibling.textContent.trim(); } return null; }
function getElementValueByPath(obj, path) { if (!path || typeof path !== 'string') return undefined; try { return path.split('.').reduce((o, key) => (o && typeof o === 'object' && o[key] !== undefined) ? o[key] : undefined, obj); } catch (e) { console.warn(`通过路径 "${path}" 获取值时出错:`, e); return undefined; } }

// --- 表单提取 (extractFormElements) ---
// ... (代码保持不变) ...
function extractFormElements() { console.log("AI Resume Filler: 开始提取表单元素..."); const extractedFields = []; try { const potentialElements = document.querySelectorAll('form input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), form select, form textarea, body *:not(form) input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), body *:not(form) select, body *:not(form) textarea'); console.log(`发现 ${potentialElements.length} 个潜在元素。`); potentialElements.forEach((element) => { if (element.offsetParent === null && element.offsetWidth === 0 && element.offsetHeight === 0) return; const fieldInfo = { id: element.id || null, name: element.name || null, type: element.type ? element.type.toLowerCase() : element.tagName.toLowerCase(), tagName: element.tagName.toLowerCase(), placeholder: element.placeholder || null, value: element.value || '', ariaLabel: element.getAttribute('aria-label') || null, labelText: findLabelForElement(element) || null, options: element.tagName.toLowerCase() === 'select' ? Array.from(element.options).map(opt => ({ value: opt.value, text: opt.text })) : null, attributes: { id: element.id || null, name: element.name || null, type: element.type ? element.type.toLowerCase() : element.tagName.toLowerCase(), placeholder: element.placeholder || null, ariaLabel: element.getAttribute('aria-label') || null, class: element.className || null } }; if (['button', 'submit', 'reset', 'image'].includes(fieldInfo.type)) return; if (fieldInfo.id || fieldInfo.name || fieldInfo.labelText || fieldInfo.placeholder || fieldInfo.ariaLabel) { extractedFields.push(fieldInfo); } else { console.log("跳过无用标识符的元素:", element); } }); console.log(`AI Resume Filler: 提取到 ${extractedFields.length} 个表单字段。`); return extractedFields; } catch (error) { console.error("提取表单元素时出错:", error); return null; } }

// --- 表单填充 (fillForm) ---
// ... (代码保持不变) ...
function fillForm(mapping, resumeData) { console.log("AI Resume Filler: 开始填充表单..."); console.log("收到的映射关系:", mapping); let filledCount = 0; let failedCount = 0; const fieldKeys = Object.keys(mapping); const totalFieldsToFill = fieldKeys.length; fieldKeys.forEach(resumeKeyPath => { const selector = mapping[resumeKeyPath]; if (!selector) { console.warn(`键 ${resumeKeyPath} 缺少选择器。`); failedCount++; return; } const value = getElementValueByPath(resumeData, resumeKeyPath); if (value === undefined || value === null || value === '') { return; } let targetElement = null; try { targetElement = document.querySelector(selector); } catch (e) { console.error(`选择器 "${selector}" (用于 ${resumeKeyPath}) 无效:`, e); failedCount++; return; } if (!targetElement) { console.warn(`使用选择器 "${selector}" (用于 ${resumeKeyPath}) 未找到元素。`); failedCount++; return; } try { const tagName = targetElement.tagName.toLowerCase(); const elementType = targetElement.type ? targetElement.type.toLowerCase() : tagName; let filled = false; if (tagName === 'input') { switch (elementType) { case 'text': case 'email': case 'tel': case 'url': case 'number': case 'search': case 'password': case 'month': case 'week': case 'time': case 'datetime-local': if (elementType === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) { targetElement.value = value; filled = true; } else if (elementType === 'month' && /^\d{4}-\d{2}$/.test(value)) { targetElement.value = value; filled = true; } else if (elementType !== 'date' && elementType !== 'month') { targetElement.value = String(value); filled = true; } else { console.warn("日期/月份格式不匹配:", value); } break; case 'checkbox': if (typeof value === 'boolean') { targetElement.checked = value; filled = true; } else if (targetElement.value && String(value).toLowerCase() === targetElement.value.toLowerCase()) { targetElement.checked = true; filled = true; } else if (['yes', 'on', 'true', '1'].includes(String(value).toLowerCase())) { targetElement.checked = true; filled = true; } else { targetElement.checked = false; filled = true; } break; case 'radio': const radioName = targetElement.name; if (radioName) { const radios = document.querySelectorAll(`input[type="radio"][name="${radioName}"]`); radios.forEach(radio => { if (String(radio.value).toLowerCase() === String(value).toLowerCase()) { radio.checked = true; filled = true; } }); if (!filled) console.warn(`未找到 name="${radioName}" 且 value="${value}" 的单选按钮。`); } else { console.warn("单选按钮缺少 name 属性:", targetElement); } break; default: console.warn(`不支持的 input 类型 "${elementType}" (选择器: ${selector})。`); } } else if (tagName === 'select') { let optionFound = false; const stringValue = String(value); for (let option of targetElement.options) { if (option.value === stringValue) { targetElement.value = option.value; optionFound = true; break; } } if (!optionFound) { const normalizedValue = stringValue.trim().toLowerCase(); for (let option of targetElement.options) { if (option.text.trim().toLowerCase() === normalizedValue) { targetElement.value = option.value; optionFound = true; break; } } } filled = optionFound; if (!optionFound) console.warn(`下拉框 [${selector}] 中找不到值 "${value}" 的选项。`); } else if (tagName === 'textarea') { targetElement.value = String(value); filled = true; } else { console.warn(`不支持的元素类型 "${tagName}" (选择器: ${selector})。`); } if (filled) { filledCount++; const inputEvent = new Event('input', { bubbles: true, cancelable: true }); const changeEvent = new Event('change', { bubbles: true, cancelable: true }); targetElement.dispatchEvent(inputEvent); targetElement.dispatchEvent(changeEvent); } else { failedCount++; console.warn(`未能填充字段: ${resumeKeyPath} (选择器: ${selector})`); } } catch (error) { console.error(`填充字段 ${resumeKeyPath} (选择器: ${selector}) 时出错:`, error); failedCount++; } }); const skippedCount = totalFieldsToFill - filledCount - failedCount; console.log(`AI Resume Filler: 填充完成。成功: ${filledCount}, 失败: ${failedCount}, 跳过(值为空): ${skippedCount}`); chrome.runtime.sendMessage({ action: "fillingComplete", success: filledCount > 0 || totalFieldsToFill === 0, filled: filledCount, failed: failedCount, skipped: skippedCount }).catch(error => console.error("发送 fillingComplete 消息失败:", error)); }

// --- 消息监听器 ---
if (!window.hasAiResumeFillerListener) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("[Content Script] 收到消息:", message);
        switch (message.action) {
            case "extractForm":
                console.log("[Content Script] 收到提取表单的请求。");
                const formData = extractFormElements();
                if (formData !== null) {
                    sendResponse({ status: "success", data: formData }); // 同步响应
                    console.log("[Content Script] 已发送提取结果。");
                } else {
                    sendResponse({ status: "error", message: "提取表单时发生错误。" });
                    console.error("[Content Script] 发送提取错误响应。");
                }
                // 即使同步响应，返回 true 也可以确保通道在 background 处理前保持打开
                return true;

            case "fillForm":
                console.log("[Content Script] 收到填充表单的请求。");
                if (message.mapping && message.resumeData) {
                     fillForm(message.mapping, message.resumeData);
                } else { console.error("[Content Script] 填充表单请求缺少 mapping 或 resumeData。"); }
                return false; // 同步处理完成

            // v--- 新增：响应 ping 请求 ---v
            case "ping":
                console.log("[Content Script] 收到来自后台的 ping 请求。");
                sendResponse({ status: "pong" }); // 回复 pong 表示已就绪
                // 返回 true 因为 sendResponse 是异步的
                return true;
            // ^--- 新增结束 ---^

            default:
                console.warn("[Content Script] 收到未知的消息 action:", message.action);
                return false; // 对于未知消息，同步返回 false
        }
    });
    window.hasAiResumeFillerListener = true;
    console.log("[Content Script] 消息监听器已设置。");
}

// --- 握手：通知后台脚本内容脚本已准备就绪 ---
try {
    console.log("[Content Script] 准备发送 'contentScriptReady' 消息...");
    chrome.runtime.sendMessage({ action: "contentScriptReady" })
        .then(response => { console.log("[Content Script] 发送 'contentScriptReady' 成功 (后台有响应):", response); })
        .catch(error => { console.warn("[Content Script] 发送 'contentScriptReady' 消息时捕获到错误:", error.message); });
    console.log("[Content Script] 'contentScriptReady' 消息已尝试发送。");
} catch (syncError) { console.error("[Content Script] 发送 'contentScriptReady' 时发生同步错误:", syncError); }

console.log("AI Resume Filler: 内容脚本初始化逻辑执行完毕。");