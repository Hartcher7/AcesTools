const STORAGE_KEY = 'playerMappings';
const SUSPECT_KEY = 'suspectTracker';
const charactersUrl = 'Data/characters.json';

const SERVER_URLS = {
  greenleaf: 'https://cors-anywhere-s2bh.onrender.com/http://fivem.greenleafrp.com:30120/players.json',
  horizon: 'https://cors-anywhere-s2bh.onrender.com/http://play.horizon-rp.com:30120/players.json'
};

let selectedServer = 'greenleaf';
let characters = [];
let suspects = {};
let onlinePlayers = [];
let currentEditingMapping = null;

function getPlayersUrl() {
  return SERVER_URLS[selectedServer];
}

function loadMappings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  characters = stored ? JSON.parse(stored) : [];
}

function saveMappings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
}

function loadSuspects() {
  const raw = localStorage.getItem(SUSPECT_KEY);
  suspects = raw ? JSON.parse(raw) : {};
}

function saveSuspects() {
  localStorage.setItem(SUSPECT_KEY, JSON.stringify(suspects));
}

function getCharacterMapping(username) {
  return characters.find(m => m.name.toLowerCase() === username.toLowerCase());
}

function updateLastSeen(mapping) {
  mapping.lastSeen = new Date().toLocaleString();
}

function tagCurrentUnmappedAsSuspect(characterName) {
  const name = characterName.trim();
  if (!name) return;
  const currentUnmapped = onlinePlayers.map(p => p.name).filter(u => !getCharacterMapping(u));
  if (!suspects[name]) {
    suspects[name] = {
      suspects: currentUnmapped,
      history: [currentUnmapped],
      lastTaggedOnline: new Date().toISOString()
    };
  } else {
    const previous = suspects[name].suspects;
    const narrowed = currentUnmapped.filter(u => previous.includes(u));
    suspects[name].suspects = narrowed;
    suspects[name].history.push(currentUnmapped);
    suspects[name].lastTaggedOnline = new Date().toISOString();
  }
  saveSuspects();
  renderData();
  renderSuspectCases();
}

function getSuspectedForUser(username) {
  return Object.entries(suspects)
    .filter(([_, data]) => data.suspects.includes(username))
    .map(([character]) => character);
}

function confirmSuspectMatch(username, characterName) {
  characters.push({
    name: username,
    characters: [{ name: characterName, affiliation: 'unknown' }],
    lastSeen: new Date().toLocaleTimeString()
  });
  delete suspects[characterName];
  saveMappings();
  saveSuspects();
  renderData();
  renderSuspectCases();
}

function renderSuspectCases() {
  const container = document.getElementById('suspectList');
  container.innerHTML = '';
  const entries = Object.entries(suspects);
  if (entries.length === 0) {
    container.innerHTML = '<p>No active suspect cases.</p>';
    return;
  }
  entries.forEach(([character, data]) => {
    const div = document.createElement('div');
    div.classList.add('card');
    div.innerHTML = `
      <strong>${character}</strong><br>
      Suspects: ${data.suspects.join(', ')}<br>
      Last Tagged: ${new Date(data.lastTaggedOnline).toLocaleString()}<br>
      <button class="button" onclick="clearSuspectCase('${character}')">Clear Case</button>
    `;
    container.appendChild(div);
  });
}

function clearSuspectCase(character) {
  delete suspects[character];
  saveSuspects();
  renderData();
  renderSuspectCases();
}

document.getElementById('tagSuspectBtn').addEventListener('click', () => {
  const input = document.getElementById('suspectInput').value;
  tagCurrentUnmappedAsSuspect(input);
  document.getElementById('suspectInput').value = '';
});

document.getElementById('toggleSuspects').addEventListener('click', () => {
  const section = document.getElementById('suspectCases');
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('serverSelect').addEventListener('change', (e) => {
  selectedServer = e.target.value;
  updatePresenceTracker();
});

async function fetchOnlinePlayers() {
  try {
    const response = await fetch(getPlayersUrl());
    if (!response.ok) throw new Error('Failed to fetch players');
    const data = await response.json();
    onlinePlayers = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching online players:', error);
    onlinePlayers = [];
  }
}

async function fetchCharacters() {
  loadMappings();
  if (characters.length === 0) {
    try {
      const response = await fetch(charactersUrl);
      if (!response.ok) throw new Error('File not found or network issue');
      const data = await response.json();
      characters = data.map(m => {
        if (!m.characters && m.character) {
          m.characters = [m.character];
          delete m.character;
        } else if (!m.characters) {
          m.characters = [];
        }
        return m;
      });
      saveMappings();
    } catch (e) {
      console.warn('Could not fetch characters.json and no localStorage fallback.');
    }
  }
}

async function updatePresenceTracker() {
  document.getElementById('loadingOverlay').classList.remove('hidden');
  await Promise.all([fetchOnlinePlayers(), fetchCharacters()]);
  loadSuspects();
  renderData();
  renderSuspectCases();
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function renderData() {
  const mappedContainer = document.getElementById('mapped-users');
  const unmappedContainer = document.getElementById('unmapped-users');
  mappedContainer.innerHTML = '<h2>Mapped Users</h2>';
  unmappedContainer.innerHTML = '<h2>Unmapped Users</h2>';

  const mappedPlayers = onlinePlayers.filter(player => getCharacterMapping(player.name));
  let groups = {};
  mappedPlayers.forEach(player => {
    let mapping = getCharacterMapping(player.name);
    updateLastSeen(mapping);
    let affil = mapping.characters[0]?.affiliation || 'unknown';
    if (!groups[affil]) groups[affil] = [];
    groups[affil].push(player);
  });

  Object.keys(groups).sort().forEach(affil => {
    const header = document.createElement('h3');
    header.textContent = `Affiliation: ${affil}`;
    mappedContainer.appendChild(header);
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    grid.style.gap = '10px';
    groups[affil].forEach(player => {
      const mapping = getCharacterMapping(player.name);
      const card = document.createElement('div');
      card.className = 'card';
      const header = document.createElement('div');
      header.className = 'card-header';
      const name = document.createElement('h3');
      name.textContent = mapping.characters.map(c => `${c.name} || ${c.affiliation || 'unknown'}`).join('\n');
      name.style.whiteSpace = 'pre-wrap';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'button';
      toggleBtn.textContent = 'Show Details';
      header.appendChild(name);
      header.appendChild(toggleBtn);
      const details = document.createElement('div');
      details.className = 'details';
      details.innerHTML = `
        <p><strong>Username:</strong> ${mapping.name}</p>
        <p><strong>Last Seen:</strong> ${mapping.lastSeen}</p>
        ${mapping.characters.map(c => c.notes ? `<p><strong>${c.name} Notes:</strong><br>${c.notes}</p>` : '').join('')}
        <button class="button" onclick="openEditor('${mapping.name}')">Edit</button>
      `;
      toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        details.style.display = details.style.display === 'none' ? 'block' : 'none';
        toggleBtn.textContent = details.style.display === 'block' ? 'Hide Details' : 'Show Details';
      });
      card.appendChild(header);
      card.appendChild(details);
      grid.appendChild(card);
    });
    mappedContainer.appendChild(grid);
  });

  const unmappedGrid = document.createElement('div');
  unmappedGrid.style.display = 'grid';
  unmappedGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
  unmappedGrid.style.gap = '10px';

  const unmappedPlayers = onlinePlayers.filter(player => !getCharacterMapping(player.name)).sort((a, b) => a.name.localeCompare(b.name));
  unmappedPlayers.forEach(player => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>${player.name}</h3>`;
    const suspected = getSuspectedForUser(player.name);
    suspected.forEach(char => {
      const pool = suspects[char]?.suspects || [];
      if (pool.length === 1 && pool[0] === player.name) {
        card.innerHTML += `<p><em>Suspected:</em> ${char}<br><button class="button" onclick="confirmSuspectMatch('${player.name}', '${char}')">Confirm Match</button></p>`;
      } else {
        card.innerHTML += `<p><em>Suspected:</em> ${char}</p>`;
      }
    });
    card.innerHTML += `<button class="button" onclick="openEditor('${player.name}', true)">Add Mapping</button>`;
    unmappedGrid.appendChild(card);
  });
  unmappedContainer.appendChild(unmappedGrid);
}

function openEditor(username, isNew = false) {
  currentEditingMapping = getCharacterMapping(username);
  if (!currentEditingMapping && isNew) {
    currentEditingMapping = { name: username, characters: [], lastSeen: new Date().toLocaleTimeString() };
    characters.push(currentEditingMapping);
    saveMappings();
  }
  document.getElementById('editUserName').textContent = username;
  populateEditorCharacters();
  document.getElementById('editorContainer').style.display = 'flex';
}

function populateEditorCharacters() {
  const charList = document.getElementById('charList');
  charList.innerHTML = '';
  currentEditingMapping.characters.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'char-row';
    row.innerHTML = `
      <input type="text" class="char-name" value="${c.name}" placeholder="Character Name" />
      <input type="text" class="char-affil" value="${c.affiliation || 'unknown'}" placeholder="Affiliation" />
      <textarea class="char-notes" placeholder="Notes...">${c.notes || ''}</textarea>
      <button class="remove-btn" onclick="removeChar(${i})">Remove</button>
    `;
    charList.appendChild(row);
  });
}

function removeChar(index) {
  currentEditingMapping.characters.splice(index, 1);
  populateEditorCharacters();
}

document.getElementById('addCharBtn').addEventListener('click', () => {
  currentEditingMapping.characters.push({ name: '', affiliation: 'unknown' });
  populateEditorCharacters();
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const names = document.querySelectorAll('.char-name');
  const affils = document.querySelectorAll('.char-affil');
  const notes = document.querySelectorAll('.char-notes');
  const newChars = [];

  names.forEach((input, i) => {
    const name = input.value.trim();
    const affil = affils[i].value.trim() || 'unknown';
    const note = notes[i].value.trim();
    if (name) newChars.push({ name, affiliation: affil, notes: note });
  });

  if (newChars.length === 0) {
    characters = characters.filter(m => m.name !== currentEditingMapping.name);
  } else {
    currentEditingMapping.characters = newChars;
  }
  saveMappings();
  document.getElementById('editorContainer').style.display = 'none';
  renderData();
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  document.getElementById('editorContainer').style.display = 'none';
});

document.getElementById('searchInput').addEventListener('input', function () {
  const q = this.value.trim().toLowerCase();
  const results = document.getElementById('searchResults');
  results.innerHTML = '';
  if (!q) return;
  characters.forEach(mapping => {
    mapping.characters.forEach(char => {
      if (char.name.toLowerCase().includes(q)) {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.textContent = `${char.name} || ${char.affiliation || 'unknown'} (User: ${mapping.name})`;
        div.addEventListener('click', () => {
          alert(`${char.name} (user: ${mapping.name}) was last online: ${mapping.lastSeen || 'Unknown'}`);
          results.innerHTML = '';
        });
        results.appendChild(div);
      }
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshButton').addEventListener('click', updatePresenceTracker);
  updatePresenceTracker();
  setInterval(updatePresenceTracker, 120000); // 2 minutes
});
