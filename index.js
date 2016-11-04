'use strict';

const nodeSsh = require('node-ssh');
const Queue = require('promise-queue');
const debug = require('debug')('sawmon:plugin:ssh');
const Promise = require('bluebird');

const connections = {};

function createNewConnection (serverId) {

    const connection = new nodeSsh();
    const queue = new Queue(1);

    return {
        execCommand: (...args) =>

            queue.add(() => {

                debug('Executing', ...args);

                return Promise.resolve(connection.execCommand(...args));

            }).catch(err => {


                /**
                 * On error, check if connected to server
                 */
                if (err.message != 'Not connected' && err.message != 'Not connected to server') throw err;

                debug('Not connected anymore, trying to reconnect..');

                /**
                 * Connect, then try again
                 */
                return queue.add(() => {

                    debug('Connecting..');

                    // Get the private key
                    return require('../../server/classes/server').findOne({_id: serverId}).select('+privateKey').exec()
                        .then(serverWithPrivateKey =>

                            // Connect
                            connection.connect({
                                host: serverWithPrivateKey.hostname,
                                username: serverWithPrivateKey.username,
                                privateKey: serverWithPrivateKey.privateKey
                            }).then(() => debug('Connected!')).catch(() => debug(serverWithPrivateKey))

                        );

                }).then(() => connection.execCommand(...args));

            })
    };

}

module.exports.servers = {};
module.exports.servers.refresh = passTrough => {

    passTrough.getSshConnection = () => {

        /**
         * Check if a connection is already made
         */
        if (connections[passTrough.instance._id]) return Promise.resolve(connections[passTrough.instance._id]);

        connections[passTrough.instance._id] = createNewConnection(passTrough.instance._id);

        return connections[passTrough.instance._id];

    };
};