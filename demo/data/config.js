/*
 * Which document source the demo uses. Edit, then refresh the page.
 *
 *   source: 'folder_source'  -> the sample files in demo/sample-files (tree from data/manifest.js)
 *   source: 'gdrive_source'  -> a Google Drive folder (fill in the block below)
 */
window.__DMS_DEMO__ = window.__DMS_DEMO__ || {};
window.__DMS_DEMO__.config = {
  source: 'folder_source',

  folder_source: {
    baseUrl: 'sample-files', // where the files are served from, relative to index.html
    readOnly: false, // edits (upload, rename, delete, new folder) live in memory only: a refresh resets them
  },

  gdrive_source: {
    rootFolderId: 'PASTE_DRIVE_FOLDER_ID', // the Drive folder that becomes the root
    accessToken: 'PASTE_OAUTH_ACCESS_TOKEN', // OAuth token with the https://www.googleapis.com/auth/drive scope
  },
};
