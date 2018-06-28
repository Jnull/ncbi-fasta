#!/usr/bin/env node

const fs = require('fs');
const axios = require('axios');
const parser = require('xml2json');

let objectCount = 0;
let searchResult;

// start with clear
console.clear();


// Configuration 

// first parameter is source file path
let srcFilePath = process.argv[2];
let srcFileExists = srcFilePath && srcFilePath.length > 0 && fs.existsSync(srcFilePath);

// first parameter is source file path
let destFilePath = process.argv[3];
let destFileExists = destFilePath && destFilePath.length > 0;


initialize();


function initialize() {
	createDestFileFromNcbi(srcFilePath, destFilePath)
	.then(result => {
		//console.log('Result');
		//console.log(result);
		fs.writeFileSync(destFilePath, result);
		console.log('complete');
	});
}

async function createDestFileFromNcbi(sourceFilePath, destinationFilePath) {
	try {
		// check if sourceFilePath is valid
		if(!sourceFilePath){ throw new Error('Source File Path Not Provided') }

		// read source file
		const sourceFile = await readSourceFile(sourceFilePath);

		// convert to json
		let sourceFileJsonArray = await fastaToJson(sourceFile);

		let mergedRecordArray = [];
		for(let i = 0; i < sourceFileJsonArray.length; i++){
			let sourceRecord = sourceFileJsonArray[i];
			let ncbiData = await fetchNcbiData(sourceRecord, (i + 1), sourceFileJsonArray.length);
			let ncbiDataObj = await convertNcbiData(ncbiData);
			let mergedRecord = sourceRecord;
			mergedRecord['country'] = ncbiDataObj.country;
			//console.log('record ' + i);
			//console.log(mergedRecord);
			mergedRecordArray.push(mergedRecord);
		}
		let fastaResultString = "";
		for(let i = 0; i < mergedRecordArray.length; i++){
			let mergedRecord = mergedRecordArray[i];
			let hasCountry = mergedRecord.country && mergedRecord.country.length > 0;
			if(!hasCountry){ mergedRecord['country'] = "" }
			let hasSequence = mergedRecord.sequence && mergedRecord.sequence.length > 0;
			if(!hasSequence){ mergedRecord['sequence'] = "" }
			fastaResultString += `>${mergedRecord.accessionNo}.${mergedRecord.version} ${mergedRecord.description} ${mergedRecord.country}\n${mergedRecord.sequence}\n`;
		}
		return fastaResultString;
	} catch(error) {
		return error;
	}	
}

async function readSourceFile(sourceFilePath) {
	try {
		// check if sourceFilePath is valid
		if(!sourceFilePath){ throw new Error('Source File Path Not Provided') }
		
		// read source
		return fs.readFileSync(sourceFilePath, 'utf8');

	} catch(error) {
		return error;
	}
}


async function fastaToJson(fasta) {
	try {
		// check if sourceFilePath is valid
		if(!fasta){ throw new Error('No Fasta Data Found In Source File') }
		
		// split by '>'
		const fastaArray = fasta.split('>');

		// remove first item in array which is always blank
		fastaArray.shift();

		// create an empty array to hold the result fasta record objects
		let fastaObjArray = [];

		for(let i = 0; i < fastaArray.length; i++){
			// set record 
			let fastaRecord = fastaArray[i];
			
			// split record by space into array
			let fastaRecordArray = fastaRecord.split(' ');
			
			// take the first item in the array which should be accessionNo.version,
			// split by '.' into array, first item should be accessionNo,
			// the second item should be the version number
			let fastaRecordObj = {
				accessionNo: fastaRecordArray[0].split('.')[0],
				version: fastaRecordArray[0].split('.')[1],
				description: null,
				sequence: null
			};

			// remove the accession from the record to leave just description and sequence
			fastaRecordArray.shift();

			// rejoin remainder of array into new variable
			let fastaRecordPartial = fastaRecordArray.join(' ');

			// description and sequence are now separated by a '\n' character
			let split2Array = fastaRecordPartial.split('\n');
			fastaRecordObj.description = split2Array[0];

			// remove first item
			split2Array.shift();

			// join remainder of sequence
			fastaRecordObj.sequence = split2Array.join('\n');

			// if the accessionNo and version are valid, push to result array
			if(fastaRecordObj.accessionNo && fastaRecordObj.version){
				fastaObjArray.push(fastaRecordObj);
			}
		}

		return fastaObjArray;

	} catch(error) {
		return error;
	}	
}

async function fetchNcbiData(sourceRecord, recordNo, recordMaxNo){
	try {
		console.clear();
		let accession = `${sourceRecord.accessionNo}.${sourceRecord.version}`;
		let url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=json`;
		console.log(`Record ${recordNo}/${recordMaxNo}:`);
		console.log(`fetching ${url}`);
		let responseXml = await axios.get(url);
		let responseXmlData = responseXml.data;
		let responseJsonObj = parser.toJson(responseXmlData, { object: true });
		return responseJsonObj;
	} catch(error) {
		return error;
	}
}

async function convertNcbiData(ncbiData){
	try {
		await searchObject('SubSource', ncbiData);
		let subSourceArray = searchResult;
		searchResult = null;
		let country;
		let resultObj = {
			country: ""
		};
		for(let i = 0; i < subSourceArray.length; i++){
			let subSource = subSourceArray[i];
			if(subSource['SubSource_subtype']['value'] === 'country'){
				resultObj.country = subSource['SubSource_name'];
			}
		}
		//console.log(resultObj);
		return resultObj;
	} catch(error) {
		return error;
	}	
}

async function searchObject(searchKey, obj){
	if(typeof obj === "object"){
		objectCount++;
		//console.log(`Searching Object ${objectCount}`);
		let objectKeys = Object.keys(obj);
		for(let i = 0; i < objectKeys.length; i++){
			let objectKey = objectKeys[i];
			let result;
			if(objectKey == searchKey){ 
				//console.log(`found ${searchKey}`);
				searchResult = obj[objectKey]; 
			}
			if(searchResult){ return true; }
			await searchObject(searchKey, obj[objectKey]);
		}
	}
}