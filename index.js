import { randomBytes } from 'node:crypto';
import process from 'node:process';
import treeKill from 'tree-kill';
import express, { response } from 'express';
import webview from 'webview';
import got from 'got';


function trim(s) {
    return s.trim()
        .replace(/^'/, '').replace(/'$/, '')
        .replace(/^"/, '').replace(/"$/, '')
        .replace(/^`/, '').replace(/`$/, '')
}

function stringify(json) {
    return JSON.stringify(json, null, 2);
}


const config = {
    clientId: "xxx",
    clientSecret: "yyy",
};

function restreamConfig() {
    return config;
}

function restreamHeaders(others) {
    const accessToken = restreamConfig().oauthInfo?.accessToken;
    return {
        'Authorization': `Bearer ${accessToken}`,
        ...others,
    };
}

function restreamIsAccessTokenExpired() {
    const configRestream = restreamConfig();
    if (configRestream) {
        const oauthInfo = configRestream.oauthInfo;
        if (oauthInfo) {
            const accessToken = oauthInfo.accessToken;
            if (accessToken) {
                const now = new Date();
                console.log('restreamIsAccessTokenExpired: now', now);
                console.log('restreamIsAccessTokenExpired: accessTokenExpiresAt', oauthInfo.accessTokenExpiresAt);
                const accessTokenExpires = new Date(0);
                accessTokenExpires.setUTCSeconds(oauthInfo.accessTokenExpiresEpoch);
                console.log('restreamIsAccessTokenExpired: accessTokenExpires', accessTokenExpires);
                if (now < accessTokenExpires) {
                    console.log('restreamIsAccessTokenExpired: accessToken NOT expired');
                    return false;
                }
                console.log('restreamIsAccessTokenExpired: accessToken expired');
            }
        }
    }
    return true;
}

function restreamIsRefreshTokenExpired() {
    const configRestream = restreamConfig();
    if (configRestream) {
        const oauthInfo = configRestream.oauthInfo;
        if (oauthInfo) {
            const refreshToken = oauthInfo.refreshToken;
            if (refreshToken) {
                const now = new Date();
                console.log('restreamIsRefreshTokenExpired: now', now);
                console.log('restreamIsRefreshTokenExpired: refreshTokenExpiresAt', oauthInfo.refreshTokenExpiresAt);
                const refreshTokenExpires = new Date(0);
                refreshTokenExpires.setUTCSeconds(oauthInfo.refreshTokenExpiresEpoch);
                console.log('restreamIsRefreshTokenExpired: refreshTokenExpires', refreshTokenExpires);
                if (now < refreshTokenExpires) {
                    console.log('restreamIsAccessTokenExpired: refreshToken NOT expired');
                    return false;
                }
                console.log('restreamIsAccessTokenExpired: refreshToken expired');
            }
        }
    }
    return true;
}

function restreamOauthSave(oauthInfo) {
    oauthInfo = {
        accessToken: oauthInfo.accessToken,
        accessTokenExpiresAt: oauthInfo.accessTokenExpiresAt,
        accessTokenExpiresEpoch: oauthInfo.accessTokenExpiresEpoch,
        refreshToken: oauthInfo.refreshToken,
        refreshTokenExpiresAt: oauthInfo.refreshTokenExpiresAt,
        refreshTokenExpiresEpoch: oauthInfo.refreshTokenExpiresEpoch,
    };
    restreamConfig().oauthInfo = oauthInfo;
}

function restreamOauthRequest(callback) {
    console.log('restreamOauthRequest(...)');
    console.log('restreamOauthRequest: Check accessToken...');
    if (!restreamIsAccessTokenExpired()) {
        console.log('restreamOauthRequest: restreamIsAccessTokenExpired() == false!; Proceed...');
        if (callback) callback();
        return;
    }
    console.log('restreamOauthRequest: restreamIsAccessTokenExpired() == true!; Check refreshToken...');
    if (!restreamIsRefreshTokenExpired()) {
        console.log('restreamOauthRequest: restreamIsRefreshTokenExpired() == false!; Refresh the token...');
        return restreamOauthRefresh(callback);
    }
    console.log('restreamOauthRequest: restreamIsRefreshTokenExpired() == true!; Fresh authentication required...');

    const configRestream = restreamConfig();
    const clientId = configRestream.clientId;
    const clientSecret = configRestream.clientSecret;

    const redirectUri = 'http://localhost:3000/callback';
    console.log('restreamOauthRequest: redirectUri', redirectUri);
    const stateRequest = randomBytes(48).toString('base64url');
    console.log('restreamOauthRequest: stateRequest', stateRequest);
    // From https://developers.restream.io/docs#authorize-dialog
    // https://api.restream.io/login?response_type=code&client_id=[your client id]&redirect_uri=[your redirect URI]&state=[random opaque token]
    const loginUri = `https://api.restream.io/login?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${stateRequest}`;
    //console.log('commandTitle: loginUri', loginUri);
    const app = express();
    app.get('/callback', async (req, res) => {
        //console.log('callback: req.query', req.query);
        const { code, scope, state: stateResponse } = req.query;
        if (stateResponse != stateRequest) {
            console.error('callback: stateResponse != stateRequest; ignoring');
            return;
        }

        // From https://developers.restream.io/docs#code-exchange
        // curl -X POST -H "Content-Type: application/x-www-form-urlencoded" --user [your client id]:[your client secret] --data "grant_type=authorization_code&redirect_uri=[your redirect URI]&code=[code]" https://api.restream.io/oauth/token
        const urlToken = 'https://api.restream.io/oauth/token';
        const dataToken = `grant_type=authorization_code&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
        got
            .post(urlToken, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                username: clientId,
                password: clientSecret,
                body: dataToken,
            })
            .then(response => {
                treeKill(client.pid);

                const body = response.body;
                console.log('restreamOauthRequest: response.body', body);
                const oauthInfo = JSON.parse(body);
                restreamOauthSave(oauthInfo);

                if (callback) callback();
            })
            .catch(error => {
                console.log('restreamOauthRequest: error', error);
                throw error;
            });
    });

    app.listen(3000, (err) => {
        if (err) return console.error(err);
        console.log(`Express server listening at ${redirectUri}`);
    });

    const client = webview.spawn({
        title: "restream.io Authenticate",
        width: 1024,
        height: 768,
        url: loginUri,
        cwd: process.cwd(),
    });
}

function restreamOauthRefresh(callback) {
    console.log('restreamOauthRefresh(...)');
    // From https://developers.restream.io/docs#refreshing-tokens
    // curl -X POST -H "Content-Type: application/x-www-form-urlencoded" --user [your client id]:[your client secret] --data "grant_type=refresh_token&refresh_token=[refresh token]" https://api.restream.io/oauth/token
    const configRestream = restreamConfig();
    const clientId = configRestream.clientId;
    const clientSecret = configRestream.clientSecret;

    const oauthInfo = configRestream.oauthInfo;
    const refreshToken = oauthInfo.refreshToken;
    const urlToken = 'https://api.restream.io/oauth/token';
    const dataToken = `grant_type=refresh_token&refresh_token=${refreshToken}`;
    return got
        .post(urlToken, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            username: clientId,
            password: clientSecret,
            body: dataToken,
        })
        .then(response => {
            const body = response.body;
            console.log('restreamOauthRefresh: response.body', body);
            const oauthInfo = JSON.parse(body);
            restreamOathSave(oauthInfo);
            if (callback) callback();
        })
        .catch(error => {
            console.log('restreamOauthRefresh: error', error);
            const body = response.body;
            console.log('restreamOauthRefresh: error.body', body);
            throw error;
        });
}

function restreamChannelsGet(callback) {
    // From https://developers.restream.io/docs#channels
    // curl -H "Authorization: Bearer [access token]" https://api.restream.io/v2/user/channel/all
    return got
        .get('https://api.restream.io/v2/user/channel/all', {
            headers: restreamHeaders(),
        })
        .then(response => {
            const body = response.body;
            console.log('restreamChannelsGet: response.body', body);
            const json = JSON.parse(body);
            callback(json);
        });
}

function restreamTitlesShow(channels) {
    console.log(`restreamTitlesShow(${JSON.stringify(channels)})`);
    const promises = [];
    channels?.forEach(channel => {
        promises.push(restreamTitleShow(channel));
    });
    return Promise.all(promises);
}

function restreamTitleShow(channel, prefix) {
    console.log(`restreamTitleShow(${JSON.stringify(channel)})`);
    return restreamChannelMetaGet(channel.id, data => {
        let message = `${prefix}\nChannel \`${channel.id}\` Meta:\n\`\`\`\n`;
        message += `Title:"${data.title}"\n`;
        message += `Description:"${data.description || ''}"\n`;
        message += '```';
        console.log('restreamTitleShow: restreamChannelMetaGet message', message);
    });
}

function restreamChannelMetaGet(channelId, callback) {
    // From https://developers.restream.io/docs#channel-meta
    // curl -H "Authorization: Bearer [access token]" https://api.restream.io/v2/user/channel-meta/123456
    return got
        .get(`https://api.restream.io/v2/user/channel-meta/${channelId}`, {
            headers: restreamHeaders()
        })
        .then(response => {
            const body = response.body;
            console.log('restreamChannelMetaGet: response.body', body);
            const json = JSON.parse(body);
            callback(json);
        });
}

function restreamChannelMetaSet(channelId, data, callback) {
    console.log(`restreamChannelMetaSet(${channelId}, ${JSON.stringify(data)}, ...`);
    // From https://developers.restream.io/docs#channel-meta-update
    // curl -X PATCH -H "Authorization: Bearer [access token]" -H "Content-Type: application/json" -d '{ "title": "New title" }' https://api.restream.io/v2/user/channel-meta/123456
    got
        .patch(`https://api.restream.io/v2/user/channel-meta/${channelId}`, {
            headers: restreamHeaders({'Content-Type': 'application/json'}),
            json: data,
        })
        .then(response => {
            const body = response.body;
            console.log('restreamChannelMetaSet: response.body', body);
            const json = JSON.parse(body);
            if (callback) callback(json);
        });
}

function commandTitle(args, callback) {
    console.log('commandTitle: args', args);
    restreamOauthRequest(() => {
        console.log('commandTitle: restreamChannelsGet(...)')
        restreamChannelsGet(channels => {
            let message = 'Channels:\n```';
            channels.forEach(channel => {
                message += `{ id:${channel.id}, embedUrl:"${channel.embedUrl}", displayName:"${channel.displayName}"}\n`;
            });
            message += '\n```';
            console.log('commandTitle: restreamChannelsGet message', message);

            if (!args || args.length == 0) {
                restreamTitlesShow(channels);
            } else {
                const title = trim(args.join(' '));
                console.log(`commandTitle: title=\"${title}\"`);
                const promises = [];
                channels.forEach(channel => {
                    const data = { title };
                    const promise = restreamChannelMetaSet(channel.id, data, (json) => {
                        //console.log('commandTitle: json', json);
                        if (json.error) {
                            const message = 'Title Set Error:\n```\n' + stringify(json) + '\n```';
                            console.log(`commandTitle: ${message}`);
                        }  else {
                            restreamTitleShow(channel, 'Title Set Success:');
                        }
                    });
                    promises.push(promise);
                });
                return Promise.all(promises).then(() => { if (callback) callback(); });
            }
        });
    });
}

// First time run it with this...
commandTitle();

// Second time, comment out the above and run it with this.
//commandTitle(["Test is a test"]);
