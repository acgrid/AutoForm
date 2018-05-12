jQuery.noConflict();
jQuery($ => {
    const UI = (function(){
        const container = $(`<section id="__AutoForm"><h5>表单填写工具</h5>
<div id="__Setup"><span></span><button>修改</button></div>
<div id="__Create"><button data-btn="query">查询服务器</button><button data-oncreate="query" data-btn="save">保存</button><p data-oncreate="query"></p></div>
<div id="__Upload" data-oncreate="page">文件选择:<select></select><form enctype="multipart/form-data"><input type="file" accept=".xls, .xlsx, .csv"><button>上传Excel表格</button></form></div>
<div id="__Execute" data-oncreate="file"></div>
</section>`);
        const ui = {
            container,
            setup: container.find("#__Setup"),
            create: container.find("#__Create"),
            files: container.find("#__Upload"),
            execute: container.find("#__Execute"),
            option: $(`<option></option>`),
            float: $('<div id="__AutoFormFloat" data-oncreate="select"><span></span><button data-btn="add">添加</button><button data-btn="remove">删除</button><button data-btn="submit">提交按钮</button></div>')
        };
        UI.page.$status = ui.page.find("p");
        UI.fileSelect = ui.files.find("select");
        return ui;
    })();
    // TODO Query BG and get current
    //
    // Is there any form elements?
    const $formElements = $('input,select,textarea');
    const $buttonElements = $('a,button');
    const runtime = {serverUrl: '', pageId: null, name: null, match: null, fields: [], files: [], submit: '', onFloat: false, onControl: false};

    if($formElements.length){
        const $body = $('body');
        $body.append(UI.container);
        $body.append(UI.float);
        chrome.storage.sync.get(({ServerUrl}) => {
            updateSetupUI(ServerUrl);
        });
        UI.setup.on("click", "button", updateServerUrl);
        UI.page.on("click", "button[data-btn=query]", makeRequest(queryServerPage));
        UI.page.on("click", "button[data-btn=save]", saveServerPage);
        UI.float.hover(() => {
            runtime.onFloat = true;
        }, () => {
            runtime.onFloat = false;
            delayedFadeOut(() => !runtime.onControl);
        });
        UI.float.on("click", "button", addRemoveElement);
        UI.files.on("click", "button", uploadList);
    }else{
        console.log('页面内未找到表单元素，退出')
    }

    function updateSetupUI(serverUrl)
    {
        const status = UI.setup.find("span");
        runtime.serverUrl = serverUrl || '';
        if(serverUrl){
            status.text("已设置服务器").prop('title', serverUrl);
            UI.page.show();
            UI.files.show();
            UI.execute.show();
        }else{
            status.text("未设置服务器").prop('title', '');
            UI.page.hide();
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
            $btn.prop('disabled', true);
            return creator().fail((jqXHR, status, error) => {
                // alert('网络请求错误');
            }).always(() => {
                $btn.prop('disabled', false);
            });
        }
    }

    function queryServerPage(){
        return $.get(`${runtime.serverUrl}/page`, {url: getUrl()}).then(page => {
            $("[data-oncreate=query]").show();
            if(page){
                setPageData(page);
            }else{
                UI.page.$status.text("新页面，请依次点击页面中的表单元素");
            }
            $formElements.addClass("__Highlight");
            $formElements.hover(onSelectElement, onDeselectElement);
            $buttonElements.hover(onSelectElement, onDeselectElement);
        });
    }

    function saveServerPage(){
        const name = window.prompt("请为该表单设置名称", runtime.name || document.title);
        const match = window.prompt("请确认该表单出现的网址", runtime.match || getUrl());
        if(!name || !match) return;
        const page = {name, match, fields: runtime.fields, submit: runtime.submit};
        return $.post(`${runtime.serverUrl}/page`, {...page, fields: JSON.stringify(runtime.fields)}).then(response => {
            if(response['pageId']){
                page.id = response['pageId'];
                setPageData(page);
            }
        });
    }

    function setPageData(page){
        console.log(page);
        runtime.pageId = page.id;
        runtime.name = page.name;
        runtime.match = page.match;
        runtime.fields = page.fields;
        runtime.submit = page.submit;
        runtime.files = page.files || [];
        UI.page.$status.text(`[${page.fields.length}个位置] ${page.name}`);
        UI.fileSelect.empty();
        UI.files.forEach(file => {
            UI.fileSelect.append(UI.option.clone().attr({value: file.id, title: (new Date(file['uploaded'] / 1000)).toLocaleString()}).text(`[${file.rows}行]${file.filename}`));
        });
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
        const element = this, isInput = ['A', 'BUTTON'].indexOf(element.tagName) === -1,
            rect = element.getBoundingClientRect(),
            path = domPath(element), pathIndex = isInput ? findPathIndex(path) : path === runtime.submit ? 1 : -1, pathAdded = pathIndex >= 0;
        UI.float.find("[data-btn=add]").toggle(isInput && !pathAdded);
        UI.float.find("[data-btn=remove]").toggle(isInput && pathAdded);
        UI.float.find("[data-btn=submit]").toggle(!isInput && !pathAdded);
        UI.float.find("span").text(pathAdded ? (isInput ? `序号：${pathIndex + 1}` : '已选为提交按钮') : '');
        UI.float.css({top: rect.y - rect.height / 2, left: rect.x}).data({path, pathIndex}).show();
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
        return $.ajax({
            url: "animes.php",
            type: "POST",
            data: new FormData($form.get(0)),
            processData: false,
            contentType: false
        }).then(response => {

        });
    }
});

