// import log       from 'fancy-log';
import isUrl from 'is-url';
import fs from 'fs';
import fetch from 'node-fetch';
import * as forms from '../../../mocked_backend/api/v3/forms.json';
import * as tags from '../../../mocked_backend/api/v3/tags.json';
import * as features from '../../../mocked_backend/api/v3/config/features.json';
import * as map from '../../../mocked_backend/api/v3/config/map.json';

const verifyStatus = function (url, options) {
    let results;
    return fetch(url, options)
        .then(response => {
            switch (response.status.toString()) {
                case '200':
                    results = {
                        type: 'confirmation',
                        messages: ['All is good. This is the expected result.'],
                        url: response.url,
                        status: response.status
                    };
                    break;
                case '404':
                    results = {
                        type: 'error',
                        messages: ['Make sure the API\'s BACKEND_URL in the .env file is the base URL to your Platform API.'],
                        url: response.url,
                        status: response.status
                    };
                    break;
                case '403':
                    results = {
                        type: 'error',
                        messages: ['Make sure the API\'s BACKEND_URL in the .env file is the base URL to your Platform API.'],
                        url: response.url,
                        status: response.status
                    };
                    break;
                case '500':
                    results = {
                        type: 'error',
                        messages: ['Oh noes. This does not look good.', 'Please check storage/logs in the Platform API, and see what the logs say about this error.'],
                        url: response.url,
                        status: response.status
                    };
                    break;
            }
            return results;
        })
        .catch(error => {
            results = {
                    type: 'error',
                    messages: ['The server could not be reached or there was an error in the request', 'Make sure the BACKEND_URL is in your .env-file', error],
                    url: url
                };
            return results;
        });
};

const verifyEnv = function (env) {
    let messages = [];
    try {
        // fs is not working in the browser, how handle it?
        fs.accessSync('.env');
    } catch (e) {
        messages.push('.env file not found. Please create the .env file in the project\'s root directory.');
    }

    if (!env.BACKEND_URL) {
        messages.push('BACKEND_URL not found in .env file.', 'Please add this URL to the .env file to connect to the Platform API.');
    }

    if (env.BACKEND_URL && !isUrl(env.BACKEND_URL)) {
        messages.push('BACKEND_URL found in .env file. Is not a valid URL.',
        'Please fix the BACKEND_URL in the .env file to connect to the Platform API.');
    }
    return messages.length > 0 ? {type: 'error', messages: messages} : {type: 'confirmation', messages: ['All good, the .env file contains required variables']};
};

const verifyTransifex = function (env) {
    if (!env.TX_USERNAME || !env.TX_PASSWORD) {
        return {type: 'warning', messages: ['TX_USERNAME and TX_PASSWORD not found in .env file. This might be ok if you are only using English, but it will not allow you to use any other languages.', 'If you need languages other than English, you will need to create a transifex account and setup the TX_USERNAME and TX_PASSWORD variables in the .env file']};
    } else {
        return {type: 'confirmation', messages: ['All good, TX_USERNAME and TX_PASSWORD found in .env file.']};
    }
};

const verifyEndpointStatus = function (env) {
    const endpoints = ['tags', 'forms', 'config/features', 'config/map'];
    return endpoints.map(function (endpoint) {
        return verifyStatus(`${env.BACKEND_URL}/api/v3/${endpoint}`)
        .then(response => {
            return response;
        });
    });
};

const verifyEndpointStructure = function (env) {
    const endpoints = ['tags', 'forms', 'config/features', 'config/map'];
    const requests = endpoints.map(function (endpoint) {
        return fetch(`${env.BACKEND_URL}/api/v3/${endpoint}`);
    });

    return Promise.all(requests)
    .then(function (responses) {
        return responses.map(function (response) {
            return response.json()
            .then(function (jsonData) {
                let structure = {};
                switch (response.url.substring(response.url.lastIndexOf('/') + 1)) {
                    case 'tags':
                        structure = tags.default;
                        break;
                    case 'forms':
                        structure = forms.default;
                        break;
                    case 'features':
                        structure = features.default;
                        break;
                    case 'map':
                        structure = map.default;
                        break;
                }
                return checkStructure(jsonData, structure, response.url);
            }).catch(error => {
                return {type: 'error', messages: ['The server could not be reached or there was an error in the request', 'Make sure your Platform API is running', error]};
            });
        });
    }).catch(error => {
        return {type: 'error', messages: ['The server could not be reached or there was an error in the request', 'Make sure your Platform API is running', error]};
    });
};

const verifyOauth = function (env) {
    let body = JSON.stringify({
        grant_type: 'client_credentials',
        client_id: env.OAUTH_CLIENT_ID || 'ushahidiui',
        client_secret: env.OAUTH_CLIENT_SECRET || '35e7f0bca957836d05ca0492211b0ac707671261',
        scope: 'forms'
    });

    let options = {
        method: 'POST',
        body: body,
        headers: {'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json'}
    };
    return {status: verifyStatus(`${env.BACKEND_URL}/oauth/token`, options), structure: checkTokenStructure(env, options), token: testToken(env, options)};
};

const verifyAPIEnvs = function (env) {
    return checkAPI(`${env.BACKEND_URL}/api/v3/verifier/env`);
};

const verifyDbConnection = function (env) {
    return checkAPI(`${env.BACKEND_URL}/api/v3/verifier/db`);
};

const checkAPI = function (url) {
    return fetch(url)
    .then(response => {
        return response.json()
        .then(jsonData => {
            return jsonData;
        })
        .catch(error => {
            return {type: 'error', messages: ['The server could not be reached or there was an error in the request', 'Make sure your Platform API is running', error]};
        });
    });
};


const checkTokenStructure = function (env, options) {
    return fetch(`${env.BACKEND_URL}/oauth/token`, options)
        .then(function (response) {
            switch (response.status.toString()) {
                case '200':
                    return response.json().then(jsonData => {
                            let preferedStructure = { token_type: 'Bearer', expires_in: '', access_token: ''};
                            return checkStructure(jsonData, preferedStructure, response.url);
                        }).catch(error => {
                            return {type: 'error', messages: ['The server could not be reached or there was an error in the request', 'Make sure your Platform API is running', error]};
                        });
                case '500':
                    return {type: 'error', messages: ['Oh noes. This does not look good.', 'Please check storage/logs in the Platform API, and see what the logs say about this error.'], url: response.url};
                case '401':
                    return {type: 'error', messages: ['Make sure your database-migrations has ran by running ./phinx migrate in the root directory of the platform API','If you have added your own client id and name, make sure the values in the .env file matches the database.'], url: response.url};
            }
        }).catch(error => {
            return {type: 'error', messages: ['Oh noes. This does not look good.', 'Please check storage/logs in the Platform API, and see what the logs say about this error.', error], url: env.BACKEND_URL};
        });
};

const testToken = function (env, options) {
    return fetch(`${env.BACKEND_URL}/oauth/token`, options)
        .then(function (response) {
            switch (response.status.toString()) {
                case '200':
                    return response.json()
                    .then(jsonData => {
                        return fetch(`${env.BACKEND_URL}/api/v3/forms`, {
                            method: 'GET',
                            headers: {
                                'Accept': 'application/json, text/plain, */*',
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${jsonData.access_token}`
                            }
                        })
                        .then(function (response) {
                            switch (response.status.toString()) {
                                case '200':
                                    return {type: 'confirmation', messages: ['Token checked and is working. All good!']};
                                case '500':
                                    return {type: 'error', messages: ['Oh noes. This does not look good.', 'Please check storage/logs in the Platform API, and see what the logs say about this error.']};
                                case '401':
                                    return {type: 'error', messages: ['Did you add your own client_secret and client_key?', 'Make sure you updated the database with the same values', 'If you did not add your own secret and key, check that the database-migration has ran, by running ./phinx migrate in the root directory of the Platform API.']};
                                case '403':
                                    return {type: 'error', messages: ['There is a problem with the oauth-scopes', 'Check that your Platform API is set up and that all migrations has ran.']};
                            }
                        }).catch(err => {
                            return {type: 'error', messages: ['The server could not be reached or there was an error in the request', 'Make sure your Platform API is running', err]};
                        });
                    }).catch(error => {
                        return {type: 'error', messages: ['Oh noes. This does not look good.', 'Please check storage/logs in the Platform API, and see what the logs say about this error.', error], url: `${env.BACKEND_URL}/api/v3/forms`};
                    });
                case '500':
                    return {type: 'error', messages: ['Oh noes. This does not look good.', 'Please check storage/logs in the Platform API, and see what the logs say about this error.'], url: `${env.BACKEND_URL}/api/v3/forms`};
                case '401':
                    return {type: 'error', messages: ['Make sure your database-migrations has ran by running ./phinx migrate in the root directory of the platform API','If you have added your own client id and name, make sure the values in the .env file matches the database.'], url: response.url};
            }
        }).catch(error => {
            return {type: 'error', messages: ['Oh noes. This does not look good.', 'Please check storage/logs in the Platform API, and see what the logs say about this error.', error], url: `${env.BACKEND_URL}/api/v3/forms`};
        });
};

const isCheckDisabled = function (env, name) {
    if (!env.USH_DISABLE_CHECKS) {
        return false;
    }
    const checks = env.USH_DISABLE_CHECKS.split(',');
    if (checks.indexOf(name) >= 0) {
        return {type: 'warning', messages: `USH_DISABLE_CHECKS contains ${name}, skipping ${name} verification process.`};
    }
};

const checkStructure = function (a, b, url) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (JSON.stringify(aKeys) === JSON.stringify(bKeys)) {
        return {type: 'confirmation', messages: [`The structure for ${url} matches the expected, all good!`], url: url};
    } else {
        return {type: 'error', messages: [`Oh noes, the structure for ${url} does not match the expected `,`Make sure you have set up the database correctly `,`Check that all migrations has ran. You can check this by running ./phinx migrate in the root directory of the Platform API.`], url: url};
    }
};

module.exports = {
    verifyStatus, verifyEndpointStatus, verifyEndpointStructure, verifyEnv, verifyOauth, verifyTransifex, verifyDbConnection, verifyAPIEnvs, isCheckDisabled};