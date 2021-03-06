//app.js
App({
    version: 'v0.1.2', //版本号
    onLaunch: function() {
        var _this = this;
        //读取缓存
        try {
            var data = wx.getStorageInfoSync();
            if (data && data.keys.length) {
                data.keys.forEach(function(key) {
                    var value = wx.getStorageSync(key);
                    if (value) {
                        _this.cache[key] = value; //把信息读取来都先临时放cache里面
                    }
                });
                if (_this.cache.version !== _this.version) {
                    _this.cache = {}; // 如果缓存里的信息和当前版本不同的话，就清空缓存
                    wx.clearStorage();
                } else {
                    _this._user.wx = _this.cache.userinfo.userInfo || {}; //要是相同，就获取用户的信息
                    _this.processData(_this.cache.userdata); //把cache里面的userdata存到_this里面
                }
            }
        } catch (e) { console.warn('获取缓存失败'); }
    },
    //保存缓存
    saveCache: function(key, value) {
        if (!key || !value) { return; }
        var _this = this;
        _this.cache[key] = value;
        wx.setStorage({
            key: key,
            data: value
        });
    },
    //清除缓存
    removeCache: function(key) {
        if (!key) { return; }
        var _this = this;
        _this.cache[key] = '';
        wx.removeStorage({
            key: key
        });
    },
    //后台切换至前台时
    onShow: function() {

    },
    //判断是否有登录信息，让分享时自动登录
    loginLoad: function(onLoad) {
        var _this = this;
        if (!_this._t) { //无登录信息——没有token
            _this.getUser(function(e) {
                typeof onLoad == "function" && onLoad(e);
            });
        } else { //有登录信息
            typeof onLoad == "function" && onLoad();
        }
    },
    //getUser函数，在index中调用
    getUser: function(response) { //参数是一个回调函数
        var _this = this;
        wx.showNavigationBarLoading();
        wx.login({
            success: function(res) {
                if (res.code) {
                    //调用函数获取微信用户信息
                    _this.getUserInfo(function(info) {
                        _this.saveCache('userinfo', info);
                        _this._user.wx = info.userInfo;
                        if (!info.encryptedData || !info.iv) {
                            _this.g_status = '无关联AppID';
                            typeof response == "function" && response(_this.g_status);
                            return;
                        }
                        //发送code与微信用户信息，获取学生数据，好像是把加密之后的数据发到服务器之后，就可以解密出来openid之类的，，解密的时候需要session_key
                        wx.request({
                            method: 'POST',
                            url: _this._server + '/api/users/get_info.php',
                            data: {
                                code: res.code,
                                key: info.encryptedData,
                                iv: info.iv
                            },
                            success: function(res) { //服务器返回了一堆游泳的东西：例如openid
                                if (res.data && res.data.status >= 200 && res.data.status < 400) {
                                    var status = false,
                                        data = res.data.data;
                                    //判断缓存是否有更新
                                    if (_this.cache.version !== _this.version || _this.cache.userdata !== data) {
                                        _this.saveCache('version', _this.version);
                                        _this.saveCache('userdata', data);
                                        _this.processData(data);
                                        status = true;
                                    }
                                    if (!_this._user.is_bind) { //如果没被绑定，那就去登陆
                                        wx.navigateTo({
                                            url: '/pages/more/login'
                                        });
                                    }
                                    //如果缓存有更新，则执行回调函数
                                    if (status) {
                                        typeof response == "function" && response();
                                    }
                                } else {
                                    //清除缓存
                                    if (_this.cache) {
                                        _this.cache = {};
                                        wx.clearStorage();
                                    }
                                    typeof response == "function" && response(res.data.message || '加载失败');
                                }
                            },
                            fail: function(res) {
                                var status = '';
                                // 判断是否有缓存
                                if (_this.cache.version === _this.version) {
                                    status = '离线缓存模式';
                                } else {
                                    status = '网络错误';
                                }
                                _this.g_status = status;
                                typeof response == "function" && response(status);
                                console.warn(status);
                            },
                            complete: function() {
                                wx.hideNavigationBarLoading();
                            }
                        });
                    });
                }
            }
        });
    },
    processData: function(key) { //把key来解密，存到data里面，顺便，更新一波用户信息，最后还可以把data返回回去
        var _this = this;
        var data = JSON.parse(_this.util.base64.decode(key));
        _this._user.is_bind = data.is_bind;
        _this._user.openid = data.user.openid;
        _this._user.teacher = (data.user.type == '教职工');
        _this._user.we = data.user; //用户详情
        _this._time = data.time;
        _this._t = data['\x74\x6f\x6b\x65\x6e'];
        console.log(_this);
        return data;
    },
    getUserInfo: function(cb) { //参数是一个回调函数，在这只为给wx.getUserInfo加一个壳
        var _this = this;
        //获取微信用户信息
        wx.getUserInfo({
            success: function(res) {
                typeof cb == "function" && cb(res);
            },
            fail: function(res) {
                _this.showErrorModal('拒绝授权将导致无法关联学校帐号并影响使用，请重新打开We重邮再点击允许授权！', '授权失败');
                _this.g_status = '未授权';
            }
        });
    },
    //完善信息
    appendInfo: function(data) {
        var _this = this;
        _this.cache = {};
        wx.clearStorage();
        _this._user.we.build = data.build || '';
        _this._user.we.room = data.room || '';
    },
    showErrorModal: function(content, title) { //用于显示错误信息
        wx.showModal({
            title: title || '加载失败',
            content: content || '未知错误',
            showCancel: false
        });
    },
    showLoadToast: function(title, duration) {
        wx.showToast({
            title: title || '加载中',
            icon: 'loading',
            mask: true,
            duration: duration || 10000
        });
    },
    util: require('./utils/util'),
    key: function(data) { return this.util.key(data) },
    enCodeBase64: function(data) { return this.util.base64.encode(data) },
    cache: {},
    _server: 'https://we.cqu.pt',
    _user: {
        //微信数据
        wx: {},
        //学生\老师数据
        we: {}
    },
    _time: {} //当前学期周数
});