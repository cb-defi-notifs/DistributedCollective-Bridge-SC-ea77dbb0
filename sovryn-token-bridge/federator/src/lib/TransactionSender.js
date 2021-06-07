
const Tx = require('ethereumjs-tx');
const ethUtils = require('ethereumjs-util');
const utils = require('./utils');
const CustomError = require('./CustomError');
const GasPriceEstimator = require('./GasPriceEstimator');
const fs = require('fs');

module.exports = class TransactionSender {
    constructor(client, logger, config) {
        this.client = client;
        this.logger = logger;
        this.chainId = null;
        this.manuallyCheck = `${config.storagePath || __dirname}/manuallyCheck.txt`;

        this.gasPriceEstimator = new GasPriceEstimator({
            web3: this.client,
            logger: this.logger,
            etherscanApiKey: config.etherscanApiKey,
        });
    }

    async getNonce(address) {
        return this.client.eth.getTransactionCount(address, "pending");
    }

    numberToHexString(number) {
        if (!number) {
            return '0x0';
        }
        return `0x${Math.ceil(parseInt(number)).toString(16)}`;
    }

    async getGasPrice(chainId) {
        return this.gasPriceEstimator.getGasPrice(chainId);
    }

    async getGasLimit(rawTx) {
        let estimatedGas = await this.client.eth.estimateGas({ gasPrice: rawTx.gasPrice, value: rawTx.value, to: rawTx.to, data: rawTx.data, from: rawTx.from});

        // Vote: ~70k
        // Vote+execute: A little over 250k
        // First side token deployment: ~3.15M
        const minimum = 300000;
        estimatedGas = (estimatedGas < minimum) ? minimum : 3500000;

        return estimatedGas;
    }

    async createRawTransaction(from, to, data, value) {
        const nonce = await this.getNonce(from);
        const chainId =  this.chainId || await this.client.eth.net.getId();
        const gasPrice = await this.getGasPrice(chainId);
        let rawTx = {
            gasPrice: this.numberToHexString(gasPrice),
            value: this.numberToHexString(value),
            to: to,
            data: data,
            from: from,
            nonce: this.numberToHexString(nonce),
            r: 0,
            s: 0
        }
        rawTx.gas = this.numberToHexString(await this.getGasLimit(rawTx));
        return rawTx;
    }

    signRawTransaction(rawTx, privateKey) {
        let tx = new Tx(rawTx);
        tx.sign(utils.hexStringToBuffer(privateKey));
        return tx;
    }

    async getAddress(privateKey) {
        let address = null;
        if (privateKey && privateKey.length) {
            address = utils.privateToAddress(privateKey);
        } else {
            //If no private key provided we use personal (personal is only for testing)
            let accounts = await this.client.eth.getAccounts();
            address = accounts[0];
        }
        return address;
    }

    async sendTransaction(to, data, value, privateKey) {
        const stack = new Error().stack;
        var from = await this.getAddress(privateKey);
        if (!from) {
            throw new CustomError(`No from address given. Is there an issue with the private key? ${stack}`);
        }
        let rawTx = await this.createRawTransaction(from, to, data, value);
        let txHash;
        let error = '';
        let errorInfo = '';
        try {
            let receipt;
            if (privateKey && privateKey.length) {
                let signedTx = this.signRawTransaction(rawTx, privateKey);
                const serializedTx = ethUtils.bufferToHex(signedTx.serialize());
                receipt = await this.client.eth.sendSignedTransaction(serializedTx).once('transactionHash', hash => txHash = hash);
            } else {
                //If no private key provided we use personal (personal is only for testing)
                delete rawTx.r;
                delete rawTx.s;
                delete rawTx.v;
                receipt = await this.client.eth.sendTransaction(rawTx).once('transactionHash', hash => txHash = hash);
            }
            if(receipt.status == 1) {
                this.logger.info(`Transaction Successful txHash:${receipt.transactionHash} blockNumber:${receipt.blockNumber}`);
                return receipt;
            }
            error = 'Transaction Receipt Status Failed';
            errorInfo = receipt;
        } catch(err) {
            if (err.message.indexOf('it might still be mined') > 0) {
                this.logger.warn(`Transaction was not mined within 750 seconds, please make sure your transaction was properly sent. Be aware that
                it might still be mined. transactionHash:${txHash}`);
                fs.appendFileSync(this.manuallyCheck, `transactionHash:${txHash} to:${to} data:${data}\n`);
                return { transactionHash: txHash };
            }
            error = `Send Signed Transaction Failed TxHash:${txHash}`;
            errorInfo = err;
        }
        this.logger.error(error, errorInfo);
        this.logger.error('RawTx that failed', rawTx);
        throw new CustomError(`Transaction Failed: ${error} ${stack}`, errorInfo);
    }

}
