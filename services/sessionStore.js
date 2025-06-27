const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'sessionStore.json');

let store = {};
try {
  if (fs.existsSync(filePath)) {
    store = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
  }
} catch (e) {
  store = {};
}

function save() {
  try {
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
  } catch (e) {
    // ignore
  }
}

function get(id) {
  return store[id];
}

function set(id, updates) {
  const current = store[id] || {};
  store[id] = { ...current, ...updates };
  save();
  return store[id];
}

function del(id) {
  if (store[id]) {
    delete store[id];
    save();
  }
}

function has(id) {
  return Object.prototype.hasOwnProperty.call(store, id);
}

module.exports = { get, set, del, has, _store: store };
