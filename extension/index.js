jQuery.noConflict();
jQuery($ => {
    const UI = (function(){
        const container = $(`<section id="__AutoForm"><h5>表单填写工具</h5>
<div id="__Setup"><span></span><button>修改</button></div>
<div id="__Create"><button data-btn="query">查询</button><button data-oncreate="save">保存</button><p data-oncreate="query"><span data-type="status"></span><span data-type="elements">0</span>个表单元素</p></div>
<div id="__Upload"></div>
<div id="__Execute"></div>
</section>`);
        return {
            container,
            setup: container.find("#__Setup"),
            create: container.find("#__Create"),
            upload: container.find("#__Upload"),
            execute: container.find("#__Execute"),
            float: $('<div id="__AutoFormFloat" data-oncreate="select"><span></span><button data-btn="add">添加</button><button data-btn="remove">删除</button><button data-btn="submit">提交按钮</button></div>')
        };
    })();
    // TODO Query BG and get current
    //
    // Is there any form elements?
    const $formElements = $('input,select,textarea');
    const $buttonElements = $('a,button');
    const runtime = {serverUrl: '', fields: [], submit: '', onFloat: false, onControl: false};

    if($formElements.length){
        const $body = $('body');
        $body.append(UI.container);
        $body.append(UI.float);
        chrome.storage.sync.get(({ServerUrl}) => {
            updateSetupUI(ServerUrl);
        });
        UI.setup.on("click", "button", updateServerUrl);
        UI.create.on("click", "button[data-btn=query]", queryServerPage);
        UI.float.hover(() => {
            runtime.onFloat = true;
        }, () => {
            runtime.onFloat = false;
            delayedFadeOut(() => !runtime.onControl);
        });
        UI.float.on("click", "button", addRemoveElement);
        UI.create.on("click", "button[data-btn=]")
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
            UI.upload.show();
            UI.execute.show();
        }else{
            status.text("未设置服务器").prop('title', '');
            UI.create.hide();
            UI.upload.hide();
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

    function queryServerPage(e){
        e.preventDefault();
        const $btn = $(this), $status = UI.create.find("p");
        $btn.prop('disabled', true);
        $.get(`${runtime.serverUrl}/page`, {url: getUrl()}).then(page => {
            $("[data-oncreate=query]").show();
            if(page){
                console.log(page);
            }else{
                $status.text("新页面，请依次点击页面中的表单元素");
                $formElements.addClass("__Highlight");
                $formElements.hover(onSelectElement, onDeselectElement);
                $buttonElements.hover(onSelectElement, onDeselectElement);
            }
        }).always(() => {
            $btn.prop('disabled', false);
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
});