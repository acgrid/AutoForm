/**
 * 这是Chrome插件中的content script
 * 会在目标页面的环境（DOM、域名）下运行
 * 能直接访问要操纵的表单元素，不存在iframe无法跨域的问题
 * 但XHR访问服务器有跨域限制，通过在服务器返回CORS头部可以解决
 */
// 让渡全局变量$,以免与页面已有jQuery冲突
jQuery.noConflict();
// 在DOM加载后运行
jQuery($ => {
    // 生成插件的DOM及其辅助引用以便后续调用
    const UI = (function(){
        const container = $(`<section id="__AutoForm"><h5>表单填写工具</h5>
<div id="__Setup"><span></span><button>修改</button></div>
<div id="__Create"><button data-btn="query">重新查询</button><button data-oncreate="query" data-btn="save">保存</button><p data-oncreate="query"></p></div>
<div id="__Upload" data-oncreate="page"><form enctype="multipart/form-data"><input type="file" name="upload" accept=".xls, .xlsx, .csv"><button>上传Excel表格</button></form></div>
<div id="__Execute" data-oncreate="file">文件选择:<select></select><br />行范围:<input type="number" name="from" value="1" />-<input type="number" name="to" value="" /><br /><button>开始填写</button><span></span></div>
</section>`);
        const ui = {
            container,
            setup: container.find("#__Setup"),
            create: container.find("#__Create"),
            files: container.find("#__Upload"),
            execute: container.find("#__Execute"),
            option: $(`<option></option>`),
            float: $('<div id="__AutoFormFloat" data-oncreate="select"><span></span><button data-btn="add">添加</button><button data-btn="remove">删除</button><button data-btn="submit">提交按钮</button><button data-btn="de-submit">取消提交按钮</button></div>')
        };
        ui.create.$status = ui.create.find("p");
        ui.fileSelect = ui.execute.find("select");
        ui.fillStatus = ui.execute.find("span");
        return ui;
    })();
    // 找出页面上已有的表单元素和可能的提交按钮元素
    const $formElements = $('input,select,textarea').not('[type=submit]');
    const $buttonElements = $('a,button,input[type=submit]');
    // 初始化运行环境
    const runtime = {serverUrl: '', pageId: null, name: null, match: null, fields: [], files: [], submit: '', onFloat: false, onControl: false};
    // 页面上可能存在表单，建立UI
    if($formElements.length){
        const $body = $('body');
        $body.append(UI.container);
        $body.append(UI.float);
        // 获取在Chrome内插件存储区内的后台URL配置
        chrome.storage.sync.get(({ServerUrl}) => {
            // 异步操作，后续进行
            updateSetupUI(ServerUrl);
        });
        // 绑定各种事件
        UI.setup.on("click", "button", updateServerUrl); // 设置后端服务器
        UI.create.on("click", "button[data-btn=query]", makeRequest(queryServerPage)); // 重新查询表单
        UI.create.on("click", "button[data-btn=save]", makeRequest(saveServerPage)); // 保存表单
        // 悬浮提示区进出flag设置及预设延迟隐藏
        UI.float.hover(() => {
            runtime.onFloat = true;
        }, () => {
            runtime.onFloat = false;
            delayedFadeOut(() => !runtime.onControl);
        });
        UI.float.on("click", "button", addRemoveElement);
        // 上传清单
        UI.files.on("click", "button", makeRequest(uploadList));
        // 开始填写
        UI.execute.on("click", "button", startSubmit);
        // 选择文件时自动设置范围
        UI.fileSelect.change(() => {
            const rows = UI.fileSelect.find(`[value=${UI.fileSelect.val()}]`).data("rows");
            if(rows) UI.execute.find("[name=to]").val(rows);
        });
    }else{
        // 页面内无表单，没有存在意义
        console.log('页面内未找到表单元素，退出')
    }

    // 后端服务器更新后的UI变化（主动设置或沿用保存的两种情况）
    function updateSetupUI(serverUrl)
    {
        const status = UI.setup.find("span");
        runtime.serverUrl = serverUrl || '';
        if(serverUrl){
            status.text("已设置服务器").prop('title', serverUrl);
            UI.create.show();
            // 若已设置服务器，立即开始查询当前页面是否有表单可填写
            queryServerPage();
        }else{
            status.text("未设置服务器").prop('title', '');
            UI.create.hide();
            UI.files.hide();
            UI.execute.hide();
        }
    }

    // 与用户交互并设置新的后端URL
    function updateServerUrl(e){
        e.preventDefault();
        const ServerUrl = window.prompt('请输入新的服务器地址', runtime.serverUrl);
        updateSetupUI(ServerUrl);
        // 保存到Chrome的插件存储区
        chrome.storage.sync.set({ServerUrl});
    }

    // 获取用于查询表单的页面URL，这里有意省略了location.scheme，以便模糊查询
    function getUrl() {
        return `${location.host}${location.pathname}${location.search}`;
    }

    // 包装XHR请求的启动收尾工作，creator函数应当返回一个jquery xhr对象，可以避免对所有xhr设置失败回调和固定回调
    function makeRequest(creator){
        return function(e){
            // 防止按钮的默认行为导致页面发生提交
            e.preventDefault();
            const $btn = $(this);
            const xhr = creator();
            // 请求过程中禁用按钮以防多次点击，并在结果确定后恢复
            if(xhr) $btn.prop('disabled', true);
            return xhr ? xhr.fail(() => {
                alert('网络请求错误');
            }).always(() => {
                $btn.prop('disabled', false);
            }) : null;
        }
    }

    // 查询当前页面可填写的表单及相关文件
    function queryServerPage(){
        return $.get(`${runtime.serverUrl}/page`, {url: getUrl()}).then(page => {
            $("[data-oncreate=query]").show();
            if(page){
                // 存在表单，设置表单和文件数据
                setPageData(page);
                chrome.storage.local.get(({tasks}) => {
                    // 若当前正在运行任务且符合页面ID，执行填写任务
                    if(tasks && tasks.pageId === runtime.pageId) doSubmit(tasks);
                });
            }else{
                UI.create.$status.text("新页面，请依次点击页面中的表单元素");
            }
            // 对表单元素添加高亮和交互
            $formElements.addClass("__Highlight");
            $formElements.hover(onSelectElement, onDeselectElement);
            $buttonElements.hover(onSelectElement, onDeselectElement);
        });
    }

    // 执行填写
    function doSubmit(tasks){
        // 任务非空
        if(Array.isArray(tasks.rows) && tasks.rows.length){
            // 取出任务中的一项，该操纵同时修改原始数组
            const row = tasks.rows.shift();
            // 数组已经为空时，将返回undefined
            if(row){ // fill
                UI.fillStatus.text(`共${tasks.total},剩余${tasks.rows.length}项`);
                // 利用各项表单元素的选择符获取DOM元素
                runtime.fields.forEach((field, index) => {
                    const $input = $(field), data = row.data[index];
                    if(!$input.length) return;
                    // 对复选框类型的特殊处理
                    if($input.attr("type") === "checkbox"){
                        $input.prop("checked", !!data);
                    }else{
                        // jQuery提供的通用设置方法
                        $input.val(data);
                    }
                });
                // 存储更新后的任务
                chrome.storage.local.set({tasks}, () => {
                    // 若设置了提交按钮，模拟点击。未设置时由用户手动完成表单其余部分后再提交，下次进入页面时开始填写下一行
                    const submit = runtime.submit;
                    if(!submit) return;
                    $(runtime.submit).click();
                });
            }else{ // empty
                UI.fillStatus.text(`共${tasks.total},填写完毕`);
                // 删除任务存储
                chrome.storage.local.remove('tasks');
            }
        }
    }

    // 获取并保存表单设置
    function saveServerPage(){
        if(runtime.fields.length === 0){
            alert('未选中任何控件');
            return;
        }
        // 新建时从页面标题和URL中获取，编辑时显示当前值
        const name = window.prompt("请为该表单设置名称", runtime.name || document.title);
        if(!name) return;
        const match = window.prompt("请确认该表单出现的网址", runtime.match || getUrl());
        if(!match) return;
        const page = {name, match, fields: runtime.fields, submit: runtime.submit};
        // 提交到服务器时需要为序列化后的JSON字符串，page常量需要后续使用
        return $.post(`${runtime.serverUrl}/page`, {...page, fields: JSON.stringify(runtime.fields)}).then(response => {
            if(response['pageId']){
                page.id = response['pageId'];
                setPageData(page);
            }
        });
    }

    // setPageData为加入每个文件项目所调用
    function addFileItem(file){
        if(typeof file === 'object' && file.id && file.filename && file.rows && file['uploaded']){
            // 在<option>中体现文件的名称、行数，悬浮提示上传时间，JavaScript中的
            UI.fileSelect.append(UI.option.clone().attr({value: file.id, "data-rows": file.rows, title: (new Date(file['uploaded'] * 1000)).toLocaleString()}).text(`[${file.rows}行]${file.filename}`));
        }
    }

    // 将表单及文件信息呈现到UI上
    function setPageData(page){
        console.log(page);
        runtime.pageId = page.id;
        runtime.name = page.name;
        runtime.match = page.match;
        runtime.fields = page.fields;
        runtime.submit = page.submit;
        runtime.files = page.files || [];
        UI.files.show();
        UI.create.$status.text(`[${page.fields.length}个位置] ${page.name}`);
        UI.fileSelect.empty();
        if(runtime.files.length){
            runtime.files.forEach(addFileItem);
            UI.execute.show();
            // 触发选择事件，默认使用第一个文件
            UI.fileSelect.change();
        }
    }

    // 统一添加删除表单元素和提交按钮的事件处理函数
    function addRemoveElement(e){
        e.preventDefault();
        const path = UI.float.data("path"), $btn = $(this), fields = runtime.fields;
        // 根据data-btn属性判断是哪个按钮
        switch($btn.data("btn")){
            case 'add':
                fields.push(path);
                break;
            case 'remove':
                fields.splice(UI.float.data("pathIndex"), 1);
                break;
            case 'submit':
                runtime.submit = path;
                break;
            case 'de-submit':
                runtime.submit = '';
                break;
        }
        UI.float.hide();
        runtime.onFloat = false;
        console.log(fields);
    }

    // 根据DOM元素找出可逆向确认的选择器，优先使用ID，以提高效率
    function domPath(el){
        const stack = [];
        // 遍历到根元素
        while ( el.parentNode != null ) {
            // 确定当前元素是父元素的第几个子元素
            let sibCount = 0, sibIndex = 0;
            for ( let i = 0; i < el.parentNode.childNodes.length; i++ ) {
                let sib = el.parentNode.childNodes[i];
                if ( sib.nodeName === el.nodeName ) {
                    if ( sib === el ) {
                        sibIndex = sibCount;
                    }
                    sibCount++;
                }
            }
            const tagName = el.nodeName.toLowerCase();
            if ( el.hasAttribute('id') && el.id !== '' ) {
                // 元素具有ID，直接使用并终止遍历
                stack.unshift(tagName + '#' + el.id);
                break;
            } else if ( sibCount > 1 ) {
                // 使用相邻元素选择器
                stack.unshift(tagName + ':eq(' + sibIndex + ')');
            } else {
                // 是父元素的唯一子元素，直接用标签选择器
                stack.unshift(tagName);
                // 通常到<body>已经足够
                if(tagName === 'body') break;
            }
            // 当前元素设为父元素
            el = el.parentNode;
        }
        // 用直接后继元素选择器拼接为完整选择符
        return stack.join('>');
    }

    // 根据延迟后当时的状态决定是否隐藏
    function delayedFadeOut(cb, time = 30){
        setTimeout(() => {
            if(cb()) UI.float.hide();
        }, time);
    }

    // 悬停到表单元素上的事件处理函数
    function onSelectElement(){
        // 判断元素类型
        const element = this, isInput = ['A', 'BUTTON'].indexOf(element.tagName) === -1 && element.type !== 'submit',
            // 包围当前元素的矩形坐标
            rect = element.getBoundingClientRect(),
            // 元素的选择符及是否已在元素列表中
            path = domPath(element), pathIndex = isInput ? findPathIndex(path) : path === runtime.submit ? 1 : -1, pathAdded = pathIndex >= 0;
        // 决定相关控件的显示隐藏
        UI.float.find("[data-btn=add]").toggle(isInput && !pathAdded);
        UI.float.find("[data-btn=remove]").toggle(isInput && pathAdded);
        UI.float.find("[data-btn=submit]").toggle(!isInput && !pathAdded);
        UI.float.find("[data-btn=de-submit]").toggle(!isInput && pathAdded);
        UI.float.find("span").text(pathAdded ? (isInput ? `序号：${pathIndex + 1}` : '已选为提交按钮') : '');
        // 将悬浮框设定在元素的附近
        UI.float.css({top: rect.y - rect.height, left: rect.x - 20}).data({path, pathIndex}).show();
        runtime.onControl = true;
    }

    // 指针离开表单元素的事件处理函数
    function onDeselectElement(){
        delayedFadeOut(() => !runtime.onFloat);
        runtime.onControl = false;
    }

    // 查询表单项目的序号
    function findPathIndex(path){
        return runtime.fields.indexOf(path);
    }

    // 文件上传的事件处理函数
    function uploadList(){
        if(runtime.pageId){
            return $.ajax({
                url: `${runtime.serverUrl}/page/${runtime.pageId}/file`,
                type: "POST",
                // 使用FormData对象使得能通过AJAX上传文件
                data: new FormData(UI.files.find("form").get(0)),
                // 由FormData控制上传细节，防止jQuery修改表单和请求
                processData: false,
                contentType: false
            }).then((data) => {
                if(data.error){
                    alert(data.error);
                }else{
                    addFileItem(data);
                    UI.execute.show();
                }
            });
        }
    }

    // 开始填写的事件处理函数
    function startSubmit() {
        const fileId = UI.execute.find("select").val();
        if(!fileId) return;
        const from = UI.execute.find("[name=from]").val() || "";
        const to = UI.execute.find("[name=to]").val() || "";
        // 从服务器获取指定文件相应范围内要填写的各行数据
        $.get(`${runtime.serverUrl}/file/${fileId}`, {from, to}).then(rows => {
            if(!rows.length) return;
            // 构建任务数据结构
            const tasks = {pageId: runtime.pageId, rows, url: location.href, total: rows.length};
            // 存储任务数据，并开始填写第一项
            chrome.storage.local.set({tasks}, () => {
                doSubmit(tasks);
            });
        });
    }
});

