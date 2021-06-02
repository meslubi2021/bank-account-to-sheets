/*
  =============================================================================
  Project Page: https://github.com/cmenon12/contemporary-choir
  Copyright:    (c) 2021 by Christopher Menon
  License:      GNU General Public License, version 3 (GPL-3.0)
                http://www.opensource.org/licenses/gpl-3.0.html
  =============================================================================
 */


/**
 * Make a request to the URL using the params.
 * 
 * @param {string} url the URL to make the request to.
 * @param {Object} params the params to use with the request.
 * @return {string} the text of the response if successful.
 * @throws {Error} response status code was not 200.
 */
function makeRequest(url, params) {

  // Make the POST request
  const response = UrlFetchApp.fetch(url, params);
  const status = response.getResponseCode();
  const responseText = response.getContentText();

  // If successful then return the response text
  if (status === 200) {
    return responseText;

    // Otherwise log and throw an error
  } else {
    Logger.log(`There was a ${status} error fetching ${url}.`);
    Logger.log(responseText);
    throw Error(`There was a ${status} error fetching ${url}.`)
  }

}


/**
 * Downloads and returns all transactions.
 * 
 * @return {Object} the result of transactions.get, with all transactions.
 */
function downloadAllTransactions() {

  // Prepare the request body
  const body = {
    "client_id": getSecrets().CLIENT_ID,
    "secret": getSecrets().SECRET,
    "access_token": getSecrets().ACCESS_TOKEN,
    "options": {
      "count": 500,
      "offset": 0
    },
    "start_date": "2017-01-01",
    "end_date": "2030-01-01"
  };

  // Condense the above into a single object
  const params = {
    "contentType": "application/json",
    "method": "post",
    "payload": JSON.stringify(body),
    "muteHttpExceptions": true
  };

  // Make the first POST request
  const result = JSON.parse(makeRequest(getSecrets().URL, params));
  const total_count = result.total_transactions;
  let offset = 0;
  let r;

  Logger.log(`There are ${total_count} transactions in Plaid.`);

  // Make repeated requests
  while (offset <= total_count - 1) {
    offset = offset + 500;
    body.options.offset = offset;
    params.payload = JSON.stringify(body);
    r = JSON.parse(makeRequest(getSecrets().URL, params));
    result.transactions = result.transactions.concat(r.transactions);
  }

  // Replace the dates with JavaScript dates
  for (let i = 0; i < result.transactions.length; i++) {
    result.transactions[i].date = Date.parse(result.transactions[i].date);
  }

  Logger.log(`We downloaded ${result.transactions.length} transactions from Plaid.`);
  return result;

}


/**
 * Fetch the transactions that are currently on the sheet.
 * 
 * @param {SpreadsheetApp.Sheet} sheet the sheet to fetch the transactions from.
 * @return {Object} the transactions.
 */
function getTransactionsFromSheet(sheet) {

  const result = {};
  result.transactions = [];
  result.available = 0.0;
  result.current = 0.0;

  // Get the headers
  result.headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues().flat();
  result.headers = result.headers.map(item => item.replace("?", ""))

  // Get the transactions, starting with most recent
  for (let i = sheet.getLastRow() - 1; i >= 2; i--) {
    if (sheet.getRange(i, 1).getValue() !== "") {

      const newTransaction = {}
      for (let j = 0; j < result.headers.length; j++) {
        newTransaction[result.headers[j].toLowerCase()] = sheet.getRange(i, j + 1).getValue();
      }
      result.transactions.push(newTransaction);
    }

    // Increment the balance(s)
    result.current += Number(sheet.getRange(i, 8).getValue());
    if (sheet.getRange(i, 9).getValue() === false) {
      result.available += Number(sheet.getRange(i, 8).getValue());
    }

  }

  Logger.log(`We fetched ${result.transactions.length} transactions from the sheet named ${sheet.getName()}.`);

  return result;


}


/**
 * Convert a Plaid transaction to a transaction for the sheet.
 * 
 * @param {Object} transaction the transaction to convert.
 * @param {Object} existing the existing transaction to update.
 * @return {Object} the converted transaction.
 */
function plaidToSheet(transaction, existing = undefined) {

  // Determine the ID
  let id;
  if (transaction.pending === true) {
    id = transaction.pending_transaction_id;
  } else {
    id = transaction_id;
  }

  // Determine the subcategory
  let subcategory = "";
  for (let i = 1; i < transaction.category.length; i++) {
    subcategory = subcategory + transaction.category[i] + " ";
  }
  subcategory = subcategory.slice(0, -1);

  // Use existing values if we have them
  let internal;
  let notes;
  if (existing !== undefined) {
    internal = false;
    notes = "";

  } else {
    internal = existing.internal;
    notes = existing.notes;
  }

  // Return the transaction for the sheet
  return {
    "id": id,
    "date": transaction.date,
    "name": transaction.name,
    "category": transaction.category[0],
    "subcategory": subcategory,
    "channel": transaction.channel,
    "type": transaction.transaction_type,
    "amount": transaction.amount,
    "pending": transaction.pending,
    "internal": internal,
    "notes": notes
  }

}


/** 
 * Searches transactions for the transaction with the ID, and returns its index.
 * Painfully inefficient.
 * 
 * @param {Object[]} transactions the transactions to search.
 * @param {string} the ID to search for.
 * @return {Number} the index of the transaction, or -1 if it doesn't exist.
*/
function getExisitingIndexById(transactions, id) {

  for (let i = 0; i < transactions.length; i++) {
    if (transactions[i].id === id) {
      return i
    }
  }
  return -1
}


/**
 * Inserts the transaction into transactions in the correct place.
 * 
 * @param {Object[]} transactions the list of transactions.
 * @param {Object} transaction the transaction to insert.
 * @return {Object[]} the updated transactions.
 */
function insertNewTransaction(transactions, transaction) {

  // Insert it just before the first element with the larger date
  for (let i = 0; i < transactions.length; i++) {
    if (transaction.date < transactions[i].date) {
      transactions.splice(i, 0, transaction);
      return transactions;
    }
  }

  // If the new transaction is the newest then add it at the end
  transactions.push(transaction);
  return transactions;

}
