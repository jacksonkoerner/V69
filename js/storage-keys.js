/**
 * Storage Keys Module - pointer and flag storage only.
 */

(function() {
  'use strict';

  // Best-effort loader for new shared modules without touching HTML.
  function ensureSharedScript(src) {
    if (typeof document === 'undefined') return;
    if (document.querySelector('script[src="' + src + '"]')) return;
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }

  if (typeof window !== 'undefined') {
    if (!window.fvpBroadcast) ensureSharedScript('./js/shared/broadcast.js');
    if (!window.dataStore) ensureSharedScript('./js/shared/data-store.js');
  }

  var STORAGE_KEYS = {
    PROJECTS: 'fvp_projects',
    ACTIVE_PROJECT_ID: 'fvp_active_project_id',
    ACTIVE_REPORT_ID: 'fvp_active_report_id',
    DEVICE_ID: 'fvp_device_id',
    USER_ID: 'fvp_user_id',
    AUTH_ROLE: 'fvp_auth_role',
    USER_NAME: 'fvp_user_name',
    USER_EMAIL: 'fvp_user_email',
    AUTH_USER_ID: 'fvp_auth_user_id',
    MIC_GRANTED: 'fvp_mic_granted',
    MIC_TIMESTAMP: 'fvp_mic_timestamp',
    CAM_GRANTED: 'fvp_cam_granted',
    LOC_GRANTED: 'fvp_loc_granted',
    LOC_LAT: 'fvp_loc_lat',
    LOC_LNG: 'fvp_loc_lng',
    LOC_TIMESTAMP: 'fvp_loc_timestamp',
    SPEECH_GRANTED: 'fvp_speech_granted',
    ONBOARDED: 'fvp_onboarded',
    BANNER_DISMISSED: 'fvp_banner_dismissed',
    BANNER_DISMISSED_DATE: 'fvp_banner_dismissed_date',
    DICTATION_HINT_DISMISSED: 'fvp_dictation_hint_dismissed',
    PERMISSIONS_DISMISSED: 'fvp_permissions_dismissed',
    ORG_ID: 'fvp_org_id',
    DELETED_REPORT_IDS: 'fvp_deleted_report_ids',
    PROJECTS_CACHE_TS: 'fvp_projects_cache_ts',
    SETTINGS_SCRATCH: 'fvp_settings_scratch',
    AI_CONVERSATION: 'fvp_ai_conversation',
    SUBMITTED_BANNER_DISMISSED: 'fvp_submitted_banner_dismissed',
    MIGRATION_V113_IDB_CLEAR: 'fvp_migration_v113_idb_clear',
    MARKUP_PHOTO: 'fvp_markup_photo'
  };

  function addToDeletedBlocklist(reportId) {
    if (!reportId) return;
    var list = JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_REPORT_IDS) || '[]');
    if (list.indexOf(reportId) === -1) {
      list.push(reportId);
      if (list.length > 100) list = list.slice(-100);
      localStorage.setItem(STORAGE_KEYS.DELETED_REPORT_IDS, JSON.stringify(list));
    }
  }

  function isDeletedReport(reportId) {
    if (!reportId) return false;
    var list = JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_REPORT_IDS) || '[]');
    return list.indexOf(reportId) !== -1;
  }

  function removeFromDeletedBlocklist(reportId) {
    if (!reportId) return;
    var list = JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_REPORT_IDS) || '[]');
    var filtered = list.filter(function(id) { return id !== reportId; });
    localStorage.setItem(STORAGE_KEYS.DELETED_REPORT_IDS, JSON.stringify(filtered));
  }

  function aiConversationKey(userId) {
    return userId
      ? STORAGE_KEYS.AI_CONVERSATION + '_' + userId
      : STORAGE_KEYS.AI_CONVERSATION;
  }

  function getDeviceId() {
    var deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }
    return deviceId;
  }

  function getStorageItem(key) {
    var item = localStorage.getItem(key);
    if (item === null) return null;
    try {
      return JSON.parse(item);
    } catch (e) {
      return item;
    }
  }

  function setStorageItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Error setting localStorage item "' + key + '":', error);
      return false;
    }
  }

  function removeStorageItem(key) {
    localStorage.removeItem(key);
  }

  if (typeof window !== 'undefined') {
    window.STORAGE_KEYS = STORAGE_KEYS;
    window.addToDeletedBlocklist = addToDeletedBlocklist;
    window.isDeletedReport = isDeletedReport;
    window.removeFromDeletedBlocklist = removeFromDeletedBlocklist;
    window.getDeviceId = getDeviceId;
    window.getStorageItem = getStorageItem;
    window.setStorageItem = setStorageItem;
    window.removeStorageItem = removeStorageItem;
    window.aiConversationKey = aiConversationKey;
  }
})();
