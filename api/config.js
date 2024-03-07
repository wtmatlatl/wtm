/*
	environment variables go here
*/
require('dotenv').config();

const DBURL = process.env.DATABASE_URL

const config = {
	DBURL
}

module.exports = config
