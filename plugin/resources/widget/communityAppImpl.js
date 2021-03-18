/* ***************************************************************** */
/*                                                                   */
/* Factor-y S.r.l.                                                   */
/*                                                                   */
/* Work based on HCL's URL widgets scripts available on              */
/* Connections 6.5 CR1                                                  */
/* ***************************************************************** */
console.log('Loading up scyCommunityApp20')

dojo.provide("com.cloud_y.apps20.widget.communityAppImpl");
dojo.requireLocalization("com.ibm.social.urliWidget.web.resources", "urlWidget");

dojo.extend(com.cloud_y.apps20.widget.communityApp, {

    debug: true,    // Default value before initialization
    _widgetDebug: function () {
        if (this.debug) {
            console.log.apply(console, arguments); // Pass on the full parameters list
        }
    },

    /*
     * Previously onload was used to:
     * - configure defaults
     * - call "init"
     * 
     * Now it:
     * - configure defaults
     * - reads widget attributes / configuration (previously in init/setupContext)
     * - sets up an extended context to enrich available information
     * - integrates code that was part of setupContext
     * - init() and setupContext() methods are removed from source
     * - Register onMessage handler to:
     * -- Support "appReady" and "setHeight" commands as in the old widget
     * -- Implements the new message hanlder based on message "Objects"
     * --- safely handles both object and stringified JSON messages. / Type checking 
     */
    onLoad: function () {

        console.log("[T] onLoad communityWidgets");

        this._resourceBundle = dojo.i18n.getLocalization("com.ibm.social.urliWidget.web.resources", "urlWidget");
        this._resize = {
            rtime: null,
            timeout: false
        };   // Data structure to support the resize handler

        if (!this.isHtml5()) {
            this.sendError(this._resourceBundle.ERROR_MSG_HTML5_SUPPORT);
            console.log("[E] Non-html5 based browser");
            return;
            // Immediately terminate  if non HTML5 browser
        }

        this.context = {};      // CNX App context
        this.remFrame = null;   // App iFrame object

        // Initialize widget from configuration

        var widgetAttributes = this.iContext.getiWidgetAttributes();
        this.extUrl = widgetAttributes.getItemValue("url");
        this.extUrlEdit = widgetAttributes.getItemValue("urlEdit") || this.extUrl;
        this.extUrlFullpage = widgetAttributes.getItemValue("urlFullpage") || this.extUrl;
        this.extUrlSearch = widgetAttributes.getItemValue("urlSearch") || this.extUrl;
        this.extHelpUrl = widgetAttributes.getItemValue("urlHelp") || '';

        this.extWidth = widgetAttributes.getItemValue("width");
        this.extHeight = widgetAttributes.getItemValue("height");
        this.extSandbox = widgetAttributes.getItemValue("sandbox");
        this.extFullScreen = widgetAttributes.getItemValue("fullscreen");
        this.extScrolling = widgetAttributes.getItemValue("scrolling");

        this.extPassQueryAndAnchor = widgetAttributes.getItemValue("urlparams") | true;

        this.onURL = widgetAttributes.getItemValue("contextOnUrl") === 'true' ? true : false; // Should the context be passed on URL ?
        this.debug = widgetAttributes.getItemValue("debug") === 'true' ? true : false; // Is debug mode

        this._widgetDebug("[DUMP onLoad]", this);

        var contextParamKeys = ["resourceId", "resourceName", "resourceType"];

        // CNX Instance environment
        this.context.env = {};
        this.context.env.baseUrl = baseProtocol + "://" + baseHost; // To be used to locate commAppApi.js script

        var searchQuery = widgetAttributes.getItemValue('searchKeywords');
        if (searchQuery != null) {
            this.context.env.searchQuery = searchQuery;
        }

        var i = null;   // Iterator variable

        // CNX Community App Context
        this.context.source = {};
        for (i = 0; i < contextParamKeys.length; i++) {
            this.context.source[contextParamKeys[i]] = widgetAttributes.getItemValue(contextParamKeys[i]);
        }
        this.context.source.widgetInstanceId = this.iContext.getWidgetId();
        this.context.source.communityType = communityType;

        // Previously orgId was defaulted to user's orgId. Doesn't work if user is a guest.
        // This fixes it using a global variable available in the community context
        this.context.source.orgId = communityOrgId;

        // CNX user app context
        this.context.user = {};
        contextParamKeys = ["userId", "orgId", "displayName", "email"];
        for (i = 0; i < contextParamKeys.length; i++) {
            var itemValue = this.iContext.getUserProfile().getItemValue(contextParamKeys[i]);
            if (itemValue != null) {
                this.context.user[contextParamKeys[i]] = itemValue;
            }
        }
        try {
            this.context.user.isExternal = lconn.core.auth.getUser().isExternal;
        } catch (e) { }

        if (this.extPassQueryAndAnchor) {
            this.context.source.urlQuery = window.location.search;
            this.context.source.urlAnchor = window.location.hash;
        }

        var self = this;
        this.context.extraContent = { 
            canContribute: self.iContext.getUserProfile().getItemValue("canContribute"), 
            canPersonalize: self.iContext.getUserProfile().getItemValue("canPersonalize") 
        };

        // Register listener for URLWidget messages
        window.addEventListener('message', function (eventMessage) {

            var commandObject;

            if (typeof eventMessage.data === 'string') {
                // Special handling of text message
                if (eventMessage.data === 'appReady') {
                    commandObject = {};
                    commandObject.command = 'appReady';
                    commandObject.origin = eventMessage.origin;
                } else if (eventMessage.data.startsWith('setHeight|' + self.context.source.widgetInstanceId + '|')) {
                    commandObject = {};
                    commandObject.command = 'setHeight';
                    commandObject.widgetInstanceId = eventMessage.data.split('|')[1];
                    commandObject.height = eventMessage.data.split('|')[2];
                    commandObject.origin = eventMessage.origin;
                }
            } else if (typeof eventMessage.data === 'object') {
                commandObject = eventMessage.data;
                commandObject.origin = eventMessage.origin;
            }

            if (typeof commandObject === "undefined") {
                try {
                    commandObject = JSON.parse(eventMessage.data);
                    commandObject.origin = eventMessage.origin;
                } catch (e) {
                    console.log("[E] " + e);
                }
            }

            // Process the parsed command
            if (typeof commandObject === "object") {
                self._processCommand(commandObject);
            } else {
                console.log("[E] cannot parse event data", eventMessage.data);
            }

        }, false);

    },

    onUnload: function() {
        this._widgetDebug('[T] onUnload');
        this._adaptConnectionsCSS('view');
    },
    /*
     * on<Mode> methods are used to handle modes following
     * the iWidget spec.
     * 
     * Old implementation initialized everything onLoad (possibly breaking lifecycle)
     */
    onView: function () {
        this._widgetDebug("[T] onView");
        this.mode = 'view';
        this.setupIFrame(this.extUrl, 'view');
    }, onEdit: function () {
        this._widgetDebug("[T] onEdit");
        this.mode = 'edit';
        this.setupIFrame(this.extUrlEdit, 'edit');
    }, onSearch: function () {
        this._widgetDebug("[T] onSearch");
        this.mode = 'search';
        this.setupIFrame(this.extUrlSearch, 'search');
    }, onFullpage: function () {
        this._widgetDebug("[T] onFullpage");
        this.mode = 'fullpage';
        this.setupIFrame(this.extUrlFullpage, 'fullpage');
    }, onHelp: function () {
        this._widgetDebug("[T] onHelp");
        this._widgetDebug('Help url',this.extHelpUrl)
    },
    /*
     * Enhanced setupIFrame allows for multiple urls and "modes".
     */
    setupIFrame: function (urlToSetup, mode) {
        this._widgetDebug("[T] setupIFrame");

        // Safe defaults / back to default url.
        var iFrameUrl = urlToSetup || this.extUrl;
        if (iFrameUrl != null) {

            this.remFrame = document.createElement("iframe");
            this.remFrame.id = "thirdPartyFrame_" + this.context.source.widgetInstanceId + "_" + mode;
            this.remFrame.style.border = "none";
            this.remFrame.width = this.extWidth || "100%";
            this.remFrame.height = this.extHeight || "100%";
            this.remFrame.scrolling = this.extScrolling || "yes";
            this.remFrame.sandbox = this.extSandbox || "allow-same-origin allow-scripts allow-popups allow-forms allow-modals";
            this.remFrame.allowfullscreen = this.extFullScreen || "true";     // Allow full screen in iFrame sandbox

            var self = this;

            // Send context to widget on url
            // This is an improvement that allows passing part of
            // widget context on the iFrame URL
            // Default = pass only "widgetInstanceId"
            // if (this.onURL) = pass fult context.source as url query params.
            // use dojo/io-query to safely encode querystring

            if (iFrameUrl.indexOf("?") < 0) {
                iFrameUrl += "?";
            } else {
                iFrameUrl += "&";
            }
            require(["dojo/io-query"]);
            dojoIoQuery = require("dojo/io-query");

            if (this.onURL) { // Full Context
                iFrameUrl += dojoIoQuery.objectToQuery(self.context.source);
                iFrameUrl += "&" + dojoIoQuery.objectToQuery({ 'connBaseUrl': self.context.env.baseUrl });
            } else { // Widget Instance Only
                iFrameUrl += dojoIoQuery.objectToQuery({
                    'connBaseUrl': self.context.env.baseUrl,
                    'widgetInstanceId': self.context.source.widgetInstanceId
                });
            }

            // In Search mode add searchquery to URL
            if (mode == 'search' && self.context.env.searchQuery != null) {
                iFrameUrl += "&" + dojoIoQuery.objectToQuery({
                    'searchQuery': self.context.env.searchQuery
                });
            }

            // Finally Initialize the iFrame

            var iframeWrapperNode = this.iContext.getElementByClass("iframeWrapper")[0];

            // Update or replace existing iframe in case of mode switching events
            // New need as previous widget didn't. Allow, cleaning up prevents memory leaks
            if (iframeWrapperNode.childNodes.length > 0) {
                x = iframeWrapperNode.removeChild(iframeWrapperNode.childNodes[0]);
                console.log("Removed", x);
            }
            iframeWrapperNode.appendChild(this.remFrame);
            this.remFrame.src = iFrameUrl;

            this._adaptConnectionsCSS(mode);

        }

    },
    /**
     * checks to see if sandboxing is supported
     */
    isHtml5: function isHtml5_$4() {
        var _9 = false;
        var _a = document.createElement("canvas");
        if (_a.getContext === undefined) {
            _9 = false;
        } else {
            _9 = true;
        }
        return _9;
    },

    /**
     * sendError() -> void reveals the error
     */
    sendError: function sendError_$5(msg) {
        var _c = msg === undefined ? this._resourceBundle.ERROR_MSG : msg;
        this.iContext.getElementByClass("fatalError")[0].style.display = "";
        this.iContext.getElementByClass("fatalError")[0].style.display = "inline";
        this.iContext.getElementByClass("iframeWrapper")[0].style.display = "none";
        this.iContext.getElementByClass("errorTitle")[0].innerHTML = this._resourceBundle.ERROR;
        this.iContext.getElementByClass("errorDesc")[0].innerHTML = _c;
    },

    /**
     * sendMessage() -> void send message uses the post function in HTML5 only
     * sends to the extensionUrl and the contentWindow.
     * 
     * This is modified to pass a specialized origin (not *) = to connections URL.
     */
    sendMessageToIFrame: function sendMessage_$6(origin, message) {
        try {
            this._widgetDebug("[M] Context posted to widget window: ", message);
            this.remFrame.contentWindow.postMessage(message, origin);
        }
        catch (e) {
            console.log("[E] " + e);
        }
    },

    /*
     * Controller for processing commands
     */
    _processCommand: function (commandObject) {

        // Compatibility behaviour for old widgets.
        if (commandObject.command === 'appReady') {
            // Request for appReady propagation
            this._widgetDebug("[CMD] appReady", commandObject);
            // Match widgetInstanceId
            if (commandObject.widgetInstanceId === this.context.source.widgetInstanceId) {
                this.sendMessageToIFrame(commandObject.origin, this.context);
            } else {
                // Notify that there's a better way to do things
                console.log("[W] widgetInstanceId is not specified, may generate messages to the wrong target");
                this.sendMessageToIFrame(commandObject.origin, this.context);
            }
        }

        // All other commands require to manage the widgetInstanceId matching

        if (commandObject.widgetInstanceId === this.context.source.widgetInstanceId) {

            if (commandObject.command === 'setHeight') {
                // Update widget iFrame height to passed value
                this._widgetDebug("[CMD] Setting height: ", commandObject);
                this.remFrame.height = commandObject.height;
            } else if (commandObject.command === 'openWindow') {
                // Open new window free of iFrame sandbox
                this._widgetDebug("[CMD] Open new window: ", commandObject);
                window.open(commandObject.url,
                    commandObject.name || '_new',
                    commandObject.specs || '',
                    commandObject.raplace || false
                );
            } else if (commandObject.command === 'setTitle') {
                // Set widget title and commit it to storage
                this._widgetDebug("[CMD] Setting title", commandObject);
                var widgetAttributes = this.iContext.getiWidgetAttributes();
                widgetAttributes.setItemValue("widgetTitle", commandObject.title);
                widgetAttributes.commit();
            } else if (commandObject.command === 'setProperty') {
                // Set widget title and commit it to storage
                this._widgetDebug("[CMD] Setting property", commandObject);
                var widgetAttributes = this.iContext.getiWidgetAttributes();
                widgetAttributes.setItemValue("app." + commandObject.name, commandObject.value);
                if (commandObject.commit) {
                    widgetAttributes.commit();
                }
            } else if (commandObject.command === 'getProperties') {
                // Set widget title and commit it to storage
                this._widgetDebug("[CMD] Getting properties", commandObject);
                var widgetAttributes = this.iContext.getiWidgetAttributes();
                // Loop to get all "app." properties
                // TODO - Not yet implemented
            } else if (commandObject.command === 'reloadCommunityPage') {
                this._widgetDebug("[CMD] Reloading community", commandObject);
                window.location.reload();
            } else if (commandObject.command === 'switchMode') {
                this._widgetDebug("[CMD] Switching mode", commandObject);
                // Fire a mode change event
                this.iContext.iEvents.fireEvent('on' + commandObject.mode, null, { 'oldMode': null });
            } else if (commandObject.command === 'registerForTopic') {
                var self = this;
                this._widgetDebug("[CMD] Register for topic", commandObject);
                // TODO - Implement better handling of registration / deregistration
                require(["dojo/topic"], function (topic) {
                    topic.subscribe("commApp/" + commandObject.topic, dojo.hitch(self, "_onTopicMessage"));
                });
            } else if (commandObject.command === 'sendToTopic') {
                this._widgetDebug("[CMD] Send to topic", commandObject);
                // TODO - Implement better handling of registration / deregistration
                require(["dojo/topic"], function (topic) {
                    topic.publish("commApp/" + commandObject.topic, {
                        'topic': commandObject.topic,
                        'message': commandObject.message
                    });
                });
            } else if (commandObject.command === 'appDialog') {

                // TODO: check that commandObject.iFrameUrl is a valid URL. Only trigger the Dialog if it is
                var self = this;
                require(["dijit/Dialog", "dojo/domReady!"], function (Dialog) {

                    if (self.widgetDialog) {
                        self.widgetDialog.destroy();
                    }

                    self.widgetDialog = new Dialog({
                        title: commandObject.title,
                        content: '<div class="commAppDialog lotusDialogBorder">' +
                            '<div class="lotusDialog" >' +
                            '<div class="lotusDialogHeader"><h1 class="lotusHeading"><a title="Close" href="javascript:window.commAppLastDialog.destroy();" style="color: #fff; text-decoration: none;">✕</a>&nbsp;<span class="title">' + (commandObject.title || 'Application dialog') + '</span></h1></div>' +
                            '<div class="lotusDialogContent" style="max-height: 100%; padding: 0!important;" >' +
                            '<iframe frameborder="0" width="100%" height="' + commandObject.height + '" src="' +
                            commandObject.iFrameUrl +
                            '" allowfullscreen="true" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe>' +
                            '</div>' +
                            // '<div class="lotusDialogFooter"><input value="Save" class="lotusFormButton submit" type="button"><input value="Cancel" class="lotusFormButton cancel" type="button"></div>' +
                            '</div>' +
                            '</div>',
                        style: "width: " + commandObject.width + "px; height: " + commandObject.height + "px;"
                    });

                    window.commAppLastDialog = self.widgetDialog;
                    self.widgetDialog.show();

                });
            }

        } else {
            this._widgetDebug("[D] widgetInstanceId not matched got " + commandObject.widgetInstanceId + " - expected " + this.context.source.widgetInstanceId);
        }
    },

    /*
     * _onTopicMessage() -> void 
     */
    _onTopicMessage: function (message) {
        this._widgetDebug("[MSG] get topic message", message);
        this.sendMessageToIFrame("*",
            {
                'command': 'topicMessage',
                'message': message
            }
        );
    },
    /* Handles resize but waits for resize to be over */
    _resizeHandler: function(event) {
        var self = this;
        this._resize.rtime = new Date();
        if (this._resize.timeout === false) {
            this._resize.timeout = true;
            setTimeout(dojo.hitch(self, "_resizeIframeHeight"), 200);
        }
        // console.log(event);
    },
    _resizeIframeHeight: function() {
        var self = this;
        if (new Date() - this._resize.rtime < 200) {
            setTimeout(dojo.hitch(self, "_resizeIframeHeight"), 200);
        } else {
            this._widgetDebug('onResize, complete, updating iframe');
            this._resize.timeout = false;
            this.remFrame.height = window.innerHeight - this.remFrame.offsetParent.offsetTop;
        }     
    },
    _adaptConnectionsCSS: function(mode) {
        var self = this;
        try {
            if (mode == 'fullpage') {
                dojo.byId('lotusMain').style.padding = '0px';
                dojo.byId('lotusMain').style.margin = '0px';
                dojo.byId('lotusMain').style.minHeight = '20px';
                dojo.byId('lotusMain').style.maxWidth = '100%';
                dojo.byId('lotusColLeft').style.display = 'none';
                dojo.byId('lotusMainColumns').style.padding = '0px';
                dojo.byId('lotusMainColumns').style.margin = '0px';
                dojo.byId('lotusContent').style.padding = '0px';
                dojo.byId('lotusContent').style.margin = '0px';
                dojo.byId('lotusContent').style.minHeight = '20px';

                this.remFrame.height = window.innerHeight - this.remFrame.offsetParent.offsetTop;
                if (this._resize.handler == null) {
                    this._resize.handler = dojo.hitch(self, "_resizeHandler");
                }
                window.addEventListener('resize', this._resize.handler);
            } else {
                window.removeEventListener('resize', this._resize.handler);
                dojo.byId('lotusMain').style.padding = null;
                dojo.byId('lotusMain').style.margin = null;
                dojo.byId('lotusMain').style.minHeight = '200px';
                dojo.byId('lotusMain').style.maxWidth = null;
                dojo.byId('lotusColLeft').style.display = null;
                dojo.byId('lotusMainColumns').style.padding =  null;
                dojo.byId('lotusMainColumns').style.margin =  null;
                dojo.byId('lotusContent').style.padding =  null;
                dojo.byId('lotusContent').style.margin =  null;
                dojo.byId('lotusContent').style.minHeight = null;
            }
        } catch (e) {
            console.log(e);
        }
    }
});