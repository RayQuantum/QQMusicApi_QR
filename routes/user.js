const jsonFile = require('jsonfile');
const getSign = require('../util/sign');
const { hash33, getGtk, getGuid } = require('../util/loginUtils');

const user = {
  '/cookie': ({req, res, globalCookie}) => {
    res.send({
      result: 100,
      data: req.cookies
    });
  },

  '/refresh': async ({req, res, request}) => {
    const {uin, qm_keyst, qqmusic_key} = req.cookies
    if (!uin || !(qm_keyst || qqmusic_key)) {
      return res.send({
        result: 301,
        errMsg: '未登陆'
      })
    }
    const data = {
      req1: {
        module: "QQConnectLogin.LoginServer",
        method: "QQLogin",
        param: {
          expired_in: 7776000, //不用管
          // onlyNeedAccessToken: 0, //不用管
          // forceRefreshToken: 0, //不用管
          // access_token: "6B0C62126368CA1ACE16C932C679747E", //access_token
          // refresh_token: "25BACF1650EE2592D06BCC19EEAD7AD6", //refresh_token
          musicid: uin, //uin或者web_uin 微信没试过
          musickey: qm_keyst || qqmusic_key, //key
        },
      },
    };
    const sign = getSign(data);
    let url = `https://u6.y.qq.com/cgi-bin/musics.fcg?sign=${sign}&format=json&inCharset=utf8&outCharset=utf-8&data=${encodeURIComponent(
      JSON.stringify(data)
    )}`;

    const result = await request({url})

    if (result.req1 && result.req1.data && result.req1.data.musickey) {
      const musicKey = result.req1.data.musickey;
      ['qm_keyst', 'qqmusic_key'].forEach((k) => {
        res.cookie(k, musicKey, {expires: new Date(Date.now() + 86400000)})
      })
      return res.send({
        result: 100,
        data: {
          musickey: result.req1.data.musickey,
        }
      });
    }
    return res.send({
      result: 200,
      errMsg: '刷新失败，建议重新设置cookie'
    })
  },

  '/getCookie': ({req, res, globalCookie}) => {
    const {id} = req.query;
    if (!id) {
      return res.send({
        result: 500,
        errMsg: 'id ?'
      });
    }

    const cookieObj = globalCookie.allCookies()[id] || {};
    Object.keys(cookieObj).forEach((k) => {
      // 有些过大的cookie 对登录校验无用，但是会导致报错
      if (cookieObj[k].length < 255) {
        res.cookie(k, cookieObj[k], {expires: new Date(Date.now() + 86400000)});
      }
    });
    return res.send({
      result: 100,
      data: cookieObj,
      message: '设置 cookie 成功',
    })
  },

  '/setCookie': ({req, res, globalCookie}) => {
    const {data} = req.body;
    const allCookies = globalCookie.allCookies();
    const userCookie = {};
    data.split('; ').forEach((c) => {
      const arr = c.split('=');
      userCookie[arr[0]] = arr[1];
    });

    if (Number(userCookie.login_type) === 2) {
      userCookie.uin = userCookie.wxuin;
    }
    userCookie.uin = (userCookie.uin || '').replace(/\D/g, '');
    allCookies[userCookie.uin] = userCookie;
    jsonFile.writeFile('data/allCookies.json', allCookies, globalCookie.refreshAllCookies);

    // 这里写死我的企鹅号，作为存在服务器上的cookie
    if (String(userCookie.uin) === String(global.QQ)) {
      globalCookie.updateUserCookie(userCookie);
      jsonFile.writeFile('data/cookie.json', userCookie, globalCookie.refreshUserCookie);
    }

    res.set('Access-Control-Allow-Origin', 'https://y.qq.com');
    res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.send({
      result: 100,
      data: '操作成功',
    })
  },

  // 获取用户歌单
  '/detail': async ({req, res, request}) => {
    const {id} = req.query;

    if (!id) {
      return res.send({
        result: 500,
        errMsg: 'id 不能为空',
      })
    }
    const result = await request({
      url: 'http://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg',
      data: {
        cid: 205360838, // 管他什么写死就好了
        userid: id, // qq号
        reqfrom: 1,
      }
    });

    if (result.code === 1000) {
      res && res.send({
        result: 301,
        errMsg: '未登陆',
        info: '建议在 https://y.qq.com 登陆并复制 cookie 尝试'
      })
      return {};
    }

    result.result = 100;
    res && res.send(result);
    return result;
  },

  // 获取用户创建的歌单
  '/songlist': async ({req, res, request}) => {
    const {id, raw} = req.query;
    if (!id) {
      return res.send({
        result: 500,
        errMsg: 'id ?',
      })
    }
    const result = await request({
      url: 'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss',
      data: {
        hostUin: 0,
        hostuin: id,
        sin: 0,
        size: 200,
        g_tk: 5381,
        loginUin: 0,
        format: 'json',
        inCharset: 'utf8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'yqq.json',
        needNewCode: 0,
      },
      headers: {
        Referer: 'https://y.qq.com/portal/profile.html',
      },
    });

    if (Number(raw)) {
      return res.send(result);
    }

    if (result.code === 4000) {
      return res.send({
        result: 100,
        data: {
          list: [],
          message: '这个人不公开歌单',
        },
      })
    }
    if (!result.data) {
      return res.send({
        result: 200,
        errMsg: '获取歌单出错',
      })
    }
    let favDiss = result.data.disslist.find((v) => v.dirid === 201);

    if (favDiss) {
      favDiss.diss_cover = 'http://y.gtimg.cn/mediastyle/global/img/cover_like.png';
    } else {
      try {
        const detail = await user["/detail"]({req: {query: {id}}, request});
        console.log(detail);
        const fav = detail.data.mymusic[0];
        favDiss = {
          "diss_name": "我喜欢",
          "diss_cover": "http://y.gtimg.cn/mediastyle/y/img/cover_qzone_130.jpg",
          "song_cnt": fav.num0,
          "listen_num": 0,
          "dirid": 201,
          "tid": fav.id,
          "dir_show": 1
        }
        result.data.disslist.unshift(favDiss);
      } catch (err) {
        console.log('获取主页信息，我喜欢的音乐失败：', err);
      }
    }
    return res.send({
      result: 100,
      data: {
        list: result.data.disslist,
        creator: {
          hostuin: id, // 这里不采用 result.data.hostuin, 因为微信登录的超长id超出了js安全数字范围
          encrypt_uin: result.data.encrypt_uin,
          hostname: result.data.hostname,
        }
      }
    })
  },

  // 获取用户收藏的歌单
  '/collect/songlist': async ({req, res, request}) => {
    const {id = req.cookies.uin, pageNo = 1, pageSize = 20, raw} = req.query;
    if (!id) {
      return res.send({
        result: 500,
        errMsg: 'id ? '
      })
    }
    const result = await request({
      url: 'https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg',
      data: {
        ct: 20,
        cid: 205360956,
        userid: id,
        reqtype: 3,
        sin: (pageNo - 1) * pageSize,
        ein: pageNo * pageSize,
      }
    });
    if (Number(raw)) {
      return res.send(result);
    }
    const {totaldiss, cdlist} = result.data;
    return res.send({
      result: 100,
      data: {
        list: cdlist,
        total: totaldiss,
        pageNo,
        pageSize,
      }
    })
  },

  // 获取用户收藏的专辑
  '/collect/album': async ({req, res, request}) => {
    const {id = req.cookies.uin, pageNo = 1, pageSize = 20, raw} = req.query;
    if (!id) {
      return res.send({
        result: 500,
        errMsg: 'id ? '
      })
    }
    const result = await request({
      url: 'https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg',
      data: {
        ct: 20,
        cid: 205360956,
        userid: id,
        reqtype: 2,
        sin: (pageNo - 1) * pageSize,
        ein: pageNo * pageSize - 1,
      }
    });
    if (Number(raw)) {
      return res.send(result);
    }
    const {totalalbum, albumlist} = result.data;
    return res.send({
      result: 100,
      data: {
        list: albumlist,
        total: totalalbum,
        pageNo,
        pageSize,
      }
    })
  },

  // 获取关注的歌手
  '/follow/singers': async ({req, res, request}) => {
    const {id = req.cookies.uin, pageNo = 1, pageSize = 20, raw} = req.query;
    if (!id) {
      return res.send({
        result: 500,
        errMsg: 'id 不能为空',
      })
    }

    const result = await request({
      url: 'https://c.y.qq.com/rsc/fcgi-bin/fcg_order_singer_getlist.fcg',
      data: {
        utf8: 1,
        page: pageNo,
        perpage: pageSize,
        uin: id,
        g_tk: 5381,
        format: 'json',
      }
    });

    if (result.code === 1000) {
      return res.send({
        result: 301,
        errMsg: '未登陆',
        info: '建议在 https://y.qq.com 登陆并复制 cookie 尝试'
      })
    }

    if (raw) {
      return res.send(result);
    }

    res.send({
      total: result.num,
      pageNo: Number(pageNo),
      pageSize: Number(pageSize),
      data: result.list,
    })
  },

  // 关注歌手操作
  '/follow': async ({req, res, request}) => {
    const {singermid, raw, operation = 1, type = 1} = req.query;

    const urlMap = {
      12: 'https://c.y.qq.com/rsc/fcgi-bin/fcg_order_singer_del.fcg',
      11: 'https://c.y.qq.com/rsc/fcgi-bin/fcg_order_singer_add.fcg',
    };

    if (!singermid) {
      return res.send({
        result: 500,
        errMsg: 'singermid 不能为空',
      });
    }

    const url = urlMap[(type * 10) + (operation * 1)];
    const result = await request({
      url,
      data: {
        g_tk: 5381,
        format: 'json',
        singermid,
      }
    });

    if (Number(raw)) {
      return res.send(result);
    }

    switch (result.code) {
      case 1000:
        return res.send({
          result: 301,
          errMsg: '未登陆',
          info: '建议在 https://y.qq.com 登陆并复制 cookie 尝试'
        });
      case 0:
        return res.send({
          result: 100,
          data: '操作成功',
          message: 'success',
        });
      default:
        return res.send({
          result: 200,
          errMsg: '未知异常',
          info: result,
        })
    }
  },

  // 获取关注的用户
  '/follow/users': async ({req, res, request}) => {
    const {id = req.cookies.uin, pageNo = 1, pageSize = 20, raw} = req.query;
    if (!id) {
      return res.send({
        result: 500,
        errMsg: 'id 不能为空',
      })
    }

    const result = await request({
      url: 'https://c.y.qq.com/rsc/fcgi-bin/friend_follow_or_listen_list.fcg',
      data: {
        utf8: 1,
        start: (pageNo - 1) * pageSize,
        num: pageSize,
        uin: id,
        format: 'json',
        g_tk: 5381,
      }
    });

    if (result.code === 1000) {
      return res.send({
        result: 301,
        errMsg: '未登陆',
        info: '建议在 https://y.qq.com 登陆并复制 cookie 尝试'
      })
    }

    if (Number(raw)) {
      return res.send(result);
    }

    res.send({
      result: 100,
      pageNo: pageNo / 1,
      pageSize: pageSize / 1,
      data: result.list,
    })
  },

  // 获取用户粉丝
  '/fans': async ({req, res, request}) => {
    const {id = req.cookies.uin, pageNo = 1, pageSize = 20, raw} = req.query;
    if (!id) {
      return res.send({
        result: 500,
        errMsg: 'id 不能为空',
      })
    }

    const result = await request({
      url: 'https://c.y.qq.com/rsc/fcgi-bin/friend_follow_or_listen_list.fcg',
      data: {
        utf8: 1,
        start: (pageNo - 1) * pageSize,
        num: pageSize,
        uin: id,
        format: 'json',
        g_tk: 5381,
        is_listen: 1,
      }
    });

    if (result.code === 1000) {
      return res.send({
        result: 301,
        errMsg: '未登陆',
        info: '建议在 https://y.qq.com 登陆并复制 cookie 尝试'
      })
    }

    if (Number(raw)) {
      return res.send(result);
    }

    res.send({
      result: 100,
      pageNo: pageNo / 1,
      pageSize: pageSize / 1,
      data: result.list,
    })
  },

  // 获取qq登录二维码
  '/getLoginQr/qq': async ({req, res, request}) => {
    const url = 'https://ssl.ptlogin2.qq.com/ptqrshow?appid=716027609&e=2&l=M&s=3&d=72&v=4&t=0.9698127522807933&daid=383&pt_3rd_aid=100497308&u1=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump';
    const response = await request(url, { responseType: 'arraybuffer', getResp: true } );
    const img = "data:image/png;base64," + (response.data && Buffer.from(response.data).toString('base64'));
    const qrsig = response.headers['set-cookie'][0] && response.headers['set-cookie'][0].match(/qrsig=([^;]+)/)[1];
    res.send({ result: 100, img, ptqrtoken: hash33(qrsig), qrsig });
  },

  // 检查qq登录二维码
  '/checkLoginQr/qq': async ({req, res, request, globalCookie}) => {
    // 使用该接口请在app.js中修改ownCookie为1
    try {
      const { ptqrtoken, qrsig } = req.body;
      if (!ptqrtoken || !qrsig) return res.send({ isOk: false, result: 500, errMsg: '参数错误' });
      const url = `https://ssl.ptlogin2.qq.com/ptqrlogin?u1=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump&ptqrtoken=${ptqrtoken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-1711022193435&js_ver=23111510&js_type=1&login_sig=du-YS1h8*0GqVqcrru0pXkpwVg2DYw-DtbFulJ62IgPf6vfiJe*4ONVrYc5hMUNE&pt_uistyle=40&aid=716027609&daid=383&pt_3rd_aid=100497308&&o1vId=3674fc47871e9c407d8838690b355408&pt_js_version=v1.48.1`;
      const response = await request({ url, headers: { Cookie: `qrsig=${qrsig}` }}, { getResp: true, customCookie: true });
      if (!response.data) return res.send({ isOk: false, result: 500, errMsg: '接口返回失败，请检查参数' });
      const { data = '' } = response;
      let allCookie = [];
      const setCookie = cookies => {
        allCookie = [...allCookie, ...cookies.map(i => i.split(';')[0]).filter(i => i.split('=')[1])];
      };

      const refresh = data.includes('已失效');
      if (!data.includes('登录成功')) return res.send({ isOk: false, result: 500, refresh, errMsg: refresh && '二维码已失效' || '未扫描二维码' });
      
      setCookie(response.headers['set-cookie']);

      // 获取p_skey 与gtk
      const checkSigUrl = data.match(/(?:'((?:https?|ftp):\/\/[^\s/$.?#].[^\s]*)')/g)[0].replaceAll('\'', '');
      const checkSigRes = await fetch(checkSigUrl, { redirect: 'manual', headers: { Cookie: allCookie.join('; ') } });
      const p_skey = checkSigRes.headers.get('Set-Cookie').match(/p_skey=([^;]+)/)[1];
      const gtk = getGtk(p_skey);
      setCookie(checkSigRes.headers.get('Set-Cookie').split(';, '));

      // authorize
      const authorizeUrl = 'https://graph.qq.com/oauth2.0/authorize';
      const getAuthorizeData = (gtk) => {
        let data = new FormData();
        data.append('response_type', 'code');
        data.append('client_id', 100497308);
        data.append('redirect_uri', 'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/');
        data.append('scope', 'get_user_info,get_app_friends');
        data.append('state', 'state');
        data.append('switch', '');
        data.append('from_ptlogin', 1);
        data.append('src', 1);
        data.append('update_auth', 1);
        data.append('openapi', '1010_1030');
        data.append('g_tk', gtk);
        data.append('auth_time', new Date);
        data.append('ui', getGuid());
        return data;
      };

      const authorizeRes = await fetch(authorizeUrl, {
        redirect: 'manual',
        method: 'POST',
        body: getAuthorizeData(gtk),
        headers: {
          Cookie: allCookie.join('; ')
        }
      });
      const code = authorizeRes.headers.get('Location').match(/[?&]code=([^&]+)/)[1];

      // login
      const getFcgReqData = (g_tk, code) => {
        const data = {
          comm: {
            "g_tk":g_tk,
            "platform":"yqq",
            "ct":24,
            "cv":0
          }, req: {
            "module":"QQConnectLogin.LoginServer",
            "method":"QQLogin",
            "param": {
              "code":code
            }
          }
        };
        return JSON.stringify(data);
      };

      const loginUrl = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        body: getFcgReqData(gtk, code),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: allCookie.join('; ')
        }
      });
      setCookie(loginRes.headers.get('Set-Cookie').split(';, '));

      const allCookies = globalCookie.allCookies();
      const userCookie = {};
      allCookie.forEach((c) => {
        const arr = c.split('=');
        userCookie[arr[0]] = arr[1];
      });

      if (Number(userCookie.login_type) === 2) {
        userCookie.uin = userCookie.wxuin;
      }
      userCookie.uin = (userCookie.uin || '').replace(/\D/g, '');
      allCookies[userCookie.uin] = userCookie;
      jsonFile.writeFile('data/allCookies.json', allCookies, globalCookie.refreshAllCookies);

      // 这里写死我的企鹅号，作为存在服务器上的cookie
      if (String(userCookie.uin) === String(global.QQ)) {
        globalCookie.updateUserCookie(userCookie);
        jsonFile.writeFile('data/cookie.json', userCookie, globalCookie.refreshUserCookie);
      }

      return res.send({ isOk: true, result: 100, message: '登录成功' ,uin: userCookie.uin, cookie: userCookie});
    } catch (error) {
      return res.send({ isOk: false, result: 500, errMsg: 'some errors' });
    }
    
  }
};

module.exports = user;
