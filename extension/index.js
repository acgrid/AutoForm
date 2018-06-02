jQuery.noConflict();
jQuery($ => {
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
    // Is there any form elements?
    const $formElements = $('input,select,textarea').not('[type=submit]');
    const $buttonElements = $('a,button,input[type=submit]');
    const runtime = {serverUrl: '', pageId: null, name: null, match: null, fields: [], files: [], submit: '', onFloat: false, onControl: false};

    if($formElements.length){
        const $body = $('body');
        $body.append(UI.container);
        $body.append(UI.float);
        chrome.storage.sync.get(({ServerUrl}) => {
            updateSetupUI(ServerUrl);
        });
        UI.setup.on("click", "button", updateServerUrl);
        UI.create.on("click", "button[data-btn=query]", makeRequest(queryServerPage));
        UI.create.on("click", "button[data-btn=save]", makeRequest(saveServerPage));
        UI.float.hover(() => {
            runtime.onFloat = true;
        }, () => {
            runtime.onFloat = false;
            delayedFadeOut(() => !runtime.onControl);
        });
        UI.float.on("click", "button", addRemoveElement);
        UI.files.on("click", "button", makeRequest(uploadList));
        UI.execute.on("click", "button", startSubmit);
        UI.fileSelect.change(() => {
            const rows = UI.fileSelect.find(`[value=${UI.fileSelect.val()}]`).data("rows");
            if(rows) UI.execute.find("[name=to]").val(rows);
        });
    }else{
        console.log('页面内未找到表单元素，退出')
    }

    function updateSetupUI(serverUrl)
    {
        const status = UI.setup.find("span");
        runtime.serverUrl = serverUrl || '';
        if(serverUrl){
            status.text("已设置服务器").prop('title', serverUrl);
            UI.create.show();
            queryServerPage();
        }else{
            status.text("未设置服务器").prop('title', '');
            UI.create.hide();
            UI.files.hide();
            UI.execute.hide();
        }
    }

    function updateServerUrl(e){
        e.preventDefault();
        const ServerUrl = window.prompt('请输入新的服务器地址', runtime.serverUrl);
        updateSetupUI(ServerUrl);
        chrome.storage.sync.set({ServerUrl});
    }

    function getUrl() {
        return `${location.host}${location.pathname}${location.search}`;
    }

    function makeRequest(creator){
        return function(e){
            e.preventDefault();
            const $btn = $(this);
            const xhr = creator();
            if(xhr) $btn.prop('disabled', true);
            return xhr ? xhr.fail(() => {
                alert('网络请求错误');
            }).always(() => {
                $btn.prop('disabled', false);
            }) : null;
        }
    }

    function queryServerPage(){
        return $.get(`${runtime.serverUrl}/page`, {url: getUrl()}).then(page => {
            $("[data-oncreate=query]").show();
            if(page){
                setPageData(page);
                chrome.storage.local.get(({tasks}) => {
                    if(tasks && tasks.pageId === runtime.pageId) doSubmit(tasks);
                });
            }else{
                UI.create.$status.text("新页面，请依次点击页面中的表单元素");
            }
            $formElements.addClass("__Highlight");
            $formElements.hover(onSelectElement, onDeselectElement);
            $buttonElements.hover(onSelectElement, onDeselectElement);
        });
    }

    function doSubmit(tasks){
        if(Array.isArray(tasks.rows) && tasks.rows.length){
            const row = tasks.rows.shift();
            if(row){ // fill
                UI.fillStatus.text(`共${tasks.total},剩余${tasks.rows.length}项`);
                runtime.fields.forEach((field, index) => {
                    const $input = $(field), data = row.data[index];
                    if(!$input.length) return;
                    if($input.attr("type") === "checkbox"){
                        $input.prop("checked", !!data);
                    }else{
                        $input.val(data);
                    }
                });
                chrome.storage.local.set({tasks}, () => {
                    const submit = runtime.submit;
                    if(!submit) return;
                    chrome.runtime.sendMessage({reload: tasks.url}, () => {
                        $(runtime.submit).click();
                    });
                });
            }else{ // empty
                UI.fillStatus.text(`共${tasks.total},填写完毕`);
                chrome.storage.local.remove('tasks');
            }
        }
    }

    function saveServerPage(){
        if(runtime.fields.length === 0){
            alert('未选中任何控件');
            return;
        }
        const name = window.prompt("请为该表单设置名称", runtime.name || document.title);
        if(!name) return;
        const match = window.prompt("请确认该表单出现的网址", runtime.match || getUrl());
        if(!match) return;
        const page = {name, match, fields: runtime.fields, submit: runtime.submit};
        return $.post(`${runtime.serverUrl}/page`, {...page, fields: JSON.stringify(runtime.fields)}).then(response => {
            if(response['pageId']){
                page.id = response['pageId'];
                setPageData(page);
            }
        });
    }

    function addFileItem(file){
        if(typeof file === 'object' && file.id && file.filename && file.rows && file['uploaded']){
            UI.fileSelect.append(UI.option.clone().attr({value: file.id, "data-rows": file.rows, title: (new Date(file['uploaded'] / 1000)).toLocaleString()}).text(`[${file.rows}行]${file.filename}`));
        }
    }

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
            UI.fileSelect.change();
        }
    }

    function addRemoveElement(e){
        e.preventDefault();
        const path = UI.float.data("path"), $btn = $(this), fields = runtime.fields;
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

    function domPath(el){
        const stack = [];
        while ( el.parentNode != null ) {
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
            if ( el.hasAttribute('id') && el.id !== '' ) {
                stack.unshift(el.nodeName.toLowerCase() + '#' + el.id);
                break;
            } else if ( sibCount > 1 ) {
                stack.unshift(el.nodeName.toLowerCase() + ':eq(' + sibIndex + ')');
            } else {
                const tagName = el.nodeName.toLowerCase();
                stack.unshift(tagName);
                if(tagName === 'body') break;
            }
            el = el.parentNode;
        }
        return stack.join('>');
    }

    function delayedFadeOut(cb, time = 30){
        setTimeout(() => {
            if(cb()) UI.float.hide();
        }, time);
    }
    function onSelectElement(){
        const element = this, isInput = ['A', 'BUTTON'].indexOf(element.tagName) === -1 && element.type !== 'submit',
            rect = element.getBoundingClientRect(),
            path = domPath(element), pathIndex = isInput ? findPathIndex(path) : path === runtime.submit ? 1 : -1, pathAdded = pathIndex >= 0;
        UI.float.find("[data-btn=add]").toggle(isInput && !pathAdded);
        UI.float.find("[data-btn=remove]").toggle(isInput && pathAdded);
        UI.float.find("[data-btn=submit]").toggle(!isInput && !pathAdded);
        UI.float.find("[data-btn=de-submit]").toggle(!isInput && pathAdded);
        UI.float.find("span").text(pathAdded ? (isInput ? `序号：${pathIndex + 1}` : '已选为提交按钮') : '');
        UI.float.css({top: rect.y - rect.height, left: rect.x - 20}).data({path, pathIndex}).show();
        runtime.onControl = true;
    }

    function onDeselectElement(){
        delayedFadeOut(() => !runtime.onFloat);
        runtime.onControl = false;
    }

    function findPathIndex(path){
        return runtime.fields.indexOf(path);
    }

    function uploadList(){
        if(runtime.pageId){
            return $.ajax({
                url: `${runtime.serverUrl}/page/${runtime.pageId}/file`,
                type: "POST",
                data: new FormData(UI.files.find("form").get(0)),
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

    function startSubmit() {
        const fileId = UI.execute.find("select").val();
        if(!fileId) return;
        const from = UI.execute.find("[name=from]").val() || "";
        const to = UI.execute.find("[name=to]").val() || "";
        $.get(`${runtime.serverUrl}/file/${fileId}`, {from, to}).then(rows => {
            if(!rows.length) return;
            const tasks = {pageId: runtime.pageId, rows, url: location.href, total: rows.length};
            chrome.storage.local.set({tasks}, () => {
                doSubmit(tasks);
            });
        });
    }
});

