function getSelectElem(name) {
    return document.querySelector(`select[name=${name}]`);
}

function loadJSON(path, success, type, error) {
    fetch(path)
      .then(response => response.json())
      .then(data => {
        success(data, type);
      })
      .catch(error => {
        console.error(error);
      });
  }

function downloadFw(manifest, type){
    var link=document.createElement('a');
    if (type =='uf2') {
        link.href = manifest.pathfw;
        link.download = manifest.name+'-'+manifest.version+'.uf2';
    }
    if (type =='ota') {
        link.href = manifest.pathota;
        link.download = manifest.name+'-'+manifest.version+'-ota.zip';
    }
    if (type =='zip') {
        link.href = manifest.pathfw;
        link.download = manifest.name+'-'+manifest.version+'.zip';
    }    
    link.click();
}

function getManifestUrl(u = getSelectElem('update').value) {
    return `./api/manifest?t=${getSelectElem('type').value}&v=${getSelectElem('version').value}&u=${u}&src=${src}`;
}

const copyNodeStyle = (sourceNode, targetNode) => {
  const computedStyle = window.getComputedStyle(sourceNode);
  for (const key of computedStyle) {
    targetNode.style.setProperty(key, computedStyle.getPropertyValue(key), computedStyle.getPropertyPriority(key))
  }
}

function onSelectionChanged() {
    const button = document.querySelector('esp-web-install-button');
    const buttonuf2 = document.querySelector('uf2-web-install-button');
    const buttonnrfota = document.querySelector('nrfota-web-install-button');
    const buttonfwzip = document.querySelector('fwzip-web-install-button');

    buttonuf2.onclick =function(){ 
      loadJSON(getManifestUrl(), downloadFw,'uf2','jsonp');
    };
    buttonnrfota.onclick =function(){ 
      loadJSON(getManifestUrl(), downloadFw,'ota','jsonp');
    };

    buttonfwzip.onclick = function() {
        loadJSON(getManifestUrl(u=5), downloadFw, 'zip', 'jsonp');
    };

    button.manifest = getManifestUrl();
    
    if (getSelectElem('type').value !== '' && getSelectElem('version').value !== '' && espd.includes(getSelectElem('type').value)) {
      //copyNodeStyle(buttonuf2.ge,button);
      button.classList.remove('invisible');
      buttonuf2.classList.add('invisible');
      buttonnrfota.classList.add('invisible');
      buttonfwzip.classList.remove('invisible');
    } else if (getSelectElem('type').value !== '' && getSelectElem('version').value !== '' && nrfd.includes(getSelectElem('type').value)) {
      buttonuf2.classList.remove('invisible');
      buttonnrfota.classList.remove('invisible');
      button.classList.add('invisible');
      buttonfwzip.classList.remove('invisible');
    } else if (getSelectElem('type').value !== '' && getSelectElem('version').value !== '' && rp2040d.includes(getSelectElem('type').value)) {
      buttonuf2.classList.remove('invisible');
      buttonnrfota.classList.add('invisible');
      button.classList.add('invisible');
      buttonfwzip.classList.remove('invisible');      
    } else {
      button.classList.add('invisible');
      buttonfwzip.classList.add('invisible');
    }
  }

function loadDeviceInfo() {
    path = `./api/infoblock?t=${getSelectElem('type').value}&src=${src}`
    const infoblock = document.querySelector('#infoblock');
    fetch(path)
      .then(response => response.json())
      .then(data => {
        infoblock.innerHTML = data.info;
      })
      .catch(error => {
        console.error(error);
      });
  }

// Function managePioTarget to add pio_target info to verblock based on selected device type
function managePioTarget(element) {
    var pbt = element.querySelector('#pbt');
    
        if(!pbt) {
            var pbt = document.createElement('p');
            pbt.id = "pbt";
            element.append(pbt);
        }
        pbt.innerHTML = "PIO target: "+getSelectElem('type').value;

  }

// Function manageNotes to add notes info to verblock based on selected device type and version
function manageNotes(element) {
  var nt = element.querySelector('#notes');
  var v = getSelectElem('version').value;
  note = notes[v];
      if(!nt) {
          var nt = document.createElement('p');
          nt.id = "notes";
          element.append(nt);
      }
  if(note) {
    nt.innerHTML = "Note: "+ note;
  } else {
      element.removeChild(nt); 
  }

}  

function loadVersionInfo() {
    verblock = document.querySelector('#fwverblock');
    manageReleaseNotes(verblock);
    manageBuildDate(verblock);
    managePioTarget(verblock);
    manageNotes(verblock);
  }

function manageReleaseNotes(element) {
    var notes_link = element.querySelector('#releaseNotes');
    var pnl = element.querySelector('#pnl');
    v = getSelectElem('version').value;
    
    if(v.endsWith(".daily")) {
        latestTag = latestTags[v];
        if(!latestTag){
          if(pnl) {
            element.removeChild(pnl);
          }
        }
        else{
          if(!notes_link) {
            var pnl = document.createElement('p');
            pnl.id = "pnl";
            var notes_link = document.createElement('a');
            notes_link.id = 'releaseNotes';
            notes_link.target = "_blank";

            pnl.appendChild(notes_link);
            element.append(pnl);
          }
          notes_link.text = "Release notes (diff)";
          v_commit = v.split('.').slice(-2)[0];
          notes_link.href = `https://github.com/meshtastic/firmware/compare/${latestTag}...${v_commit}`;
        }
    }
    else{
        if(!notes_link) {
            var pnl = document.createElement('p');
            pnl.id = "pnl";
            var notes_link = document.createElement('a');
            notes_link.id = 'releaseNotes';
            notes_link.target = "_blank";

            pnl.appendChild(notes_link);
            element.append(pnl);
        }
        notes_link.text = "Release notes";
        notes_link.href = "https://github.com/meshtastic/firmware/releases/tag/"+v;
    }
  }


function manageBuildDate(element) {
    var pbd = element.querySelector('#pbd');
    var v = getSelectElem('version').value;
    date = dates[v];
    
    if(!date) {
        if(pbd) {
          element.removeChild(pbd);
        }
    }
    else{
        if(!pbd) {
            var pbd = document.createElement('p');
            pbd.id = "pbd";
            element.append(pbd);
        }
        pbd.innerHTML = "Build date: "+date;
    }
  }


function loadDeviceVersions() {
    path = `./api/versions?t=${getSelectElem('type').value}&src=${src}`
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          versions = JSON.parse(xhr.responseText).versions;
          dates = JSON.parse(xhr.responseText).dates;
          notes = JSON.parse(xhr.responseText).notes;
          latestTags = JSON.parse(xhr.responseText).latestTags;
          select = getSelectElem('version');
          select.innerHTML = '';
          versions.forEach((v) => {
            var opt = document.createElement('option');

            opt.innerHTML = v;
            opt.value = v;
            select.appendChild(opt);
          });
          onSelectionChanged();
          loadVersionInfo();
        }
        else {
          error(xhr);
        }
      }
    };
    xhr.open('GET', path, true);
    xhr.send();

  }


  getSelectElem('type').addEventListener('change', onSelectionChanged);
  getSelectElem('type').addEventListener('change', loadDeviceInfo);
  getSelectElem('type').addEventListener('change', loadDeviceVersions);
  getSelectElem('version').addEventListener('change', onSelectionChanged);
  getSelectElem('version').addEventListener('change', loadVersionInfo);
  getSelectElem('update').addEventListener('change', onSelectionChanged);

var getParams = new URLSearchParams(window.location.search);
const src = getParams.get('src');