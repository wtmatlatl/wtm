/*
	environment variables go here
*/
require('dotenv').config();

const PULL_URL = process.env.PULL_URL
const API_SERVER_URL = process.env.API_SERVER_URL
const ENV = process.env.ENV

const config = {
	PULL_URL,
	API_SERVER_URL,
	ENV
}

module.exports = config
