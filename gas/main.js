/**
 * Initialize the spreadsheet and sheet for storing messages.
 */
function setup() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName('SignalingMessages')) {
        ss.insertSheet('SignalingMessages');
        const sheet = ss.getSheetByName('SignalingMessages');
        sheet.appendRow(['SignalName', 'FromID', 'Message', 'Timestamp']);
    }
}

/**
 * Handle GET requests to retrieve signaling messages for a specific signal name and recipient ID.
 * URL parameters:
 * - signalName: The name of the signaling session.
 * - recipientId: The ID of the recipient user.
 */
function doGet(e) {
    const signalName = e.parameter.signalName;
    const recipientId = e.parameter.recipientId;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('SignalingMessages');
    const data = sheet.getDataRange().getValues();
    const messages = [];
    let answerSent = false;

    for (let i = data.length - 1; i >= 1; i--) { // Skip header row
        const row = data[i];
        const [rowSignalName, rowFromId, rowMessage, rowTimestamp] = row;
        if (rowSignalName === signalName) {
            const messageContent = JSON.parse(rowMessage);
            if (messageContent.type === 'answer') {
                answerSent = true;
            }
            if (rowFromId !== recipientId && !answerSent) {
                messages.push({
                    from: rowFromId,
                    message: messageContent,
                    timestamp: rowTimestamp
                });
                sheet.deleteRow(i + 1); // Adjust for header row
            }
        }
    }

    return ContentService.createTextOutput(JSON.stringify(messages))
        .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle POST requests to store signaling messages.
 * Expected JSON payload:
 * {
 *   "signalName": "session1",
 *   "fromId": "user1",
 *   "message": { ... }
 * }
 */
function doPost(e) {
    const data = JSON.parse(e.postData.contents);
    const signalName = data.signalName;
    const fromId = data.fromId;
    const message = JSON.stringify(data.message);
    const timestamp = new Date().toISOString();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('SignalingMessages');
    const messageContent = data.message;

    // Check if an answer has already been sent
    if (messageContent.type === 'answer') {
        const existingData = sheet.getDataRange().getValues();
        for (let i = existingData.length - 1; i >= 1; i--) {
            const row = existingData[i];
            const [rowSignalName, , , ] = row;
            if (rowSignalName === signalName) {
                sheet.deleteRow(i + 1); // Remove existing offers
            }
        }
    }

    sheet.appendRow([signalName, fromId, message, timestamp]);

    return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
        .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Test doPost
 */
function doPostTest() {
    //create event
    var message = JSON.stringify({
                type: 'offer',
                content: {
                    key: 'key',
                    value: 'value'
                }
            });
    var contents = JSON.stringify(
    {
      signalName: 'signal name',
      fromId: 'fromId',
      message: message
    })
    var e = {};
    e.postData = {
      contents: contents
    }
    //呼び出す。
    doPost(e);
}

/**
 * Test doGet
 */
function doGetTest() {
    //eの作成
    var e = {};
    e.parameter = {
        signalName: 'signal name',
        recipientId: 'recipientId',
    };
    //呼び出す。
    doGet(e);
}

