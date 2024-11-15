function getSelectElem(name) {
    return document.querySelector(`select[name=${name}]`);
  }

  function loadJSON(path, success, type, error) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          success(JSON.parse(xhr.responseText), type);
        }
        else {
          error(xhr);
        }
      }
    };
    xhr.open('GET', path, true);
    xhr.send();
  }

  function downloadFw(manifest, type){
      //console.log(manifest);
      //window.location = manifest.pathfw;
      //window.open(manifest.pathfw, '_blank');
      var link=document.createElement('a');
      if (type =='uf2') {
        link.href = manifest.pathfw;
        link.download = manifest.name+'-'+manifest.version+'.uf2';
      }
      if (type =='ota') {
        link.href = manifest.pathota;
        link.download = manifest.name+'-'+manifest.version+'-ota.zip';
      }
      //manifest.pathfw.substr(manifest.pathfw.lastIndexOf('/') + 1);
      link.click();
  }

  function getManifestUrl() {
    return `./api/manifest?t=${getSelectElem('type').value}&v=${getSelectElem('version').value}&u=${getSelectElem('update').value}`;
  }


  function onSelectionChanged() {
    const button = document.querySelector('esp-web-install-button');
    const buttonuf2 = document.querySelector('uf2-web-install-button');
    const buttonnrfota = document.querySelector('nrfota-web-install-button');
    buttonuf2.onclick =function(){ 
      loadJSON(getManifestUrl(), downloadFw,'uf2','jsonp');
    };
    buttonnrfota.onclick =function(){ 
      loadJSON(getManifestUrl(), downloadFw,'ota','jsonp');
    };

    button.manifest = getManifestUrl();
    if (getSelectElem('type').value !== '' && getSelectElem('version').value !== '' && espd.includes(getSelectElem('type').value)) {
      button.classList.remove('invisible');
      buttonuf2.classList.add('invisible');
      buttonnrfota.classList.add('invisible');
    } else if (getSelectElem('type').value !== '' && getSelectElem('version').value !== '' && nrfd.includes(getSelectElem('type').value)) {
      buttonuf2.classList.remove('invisible');
      buttonnrfota.classList.remove('invisible');
      button.classList.add('invisible');
      
    } else if (getSelectElem('type').value !== '' && getSelectElem('version').value !== '' && rp2040d.includes(getSelectElem('type').value)) {
      buttonuf2.classList.remove('invisible');
      buttonnrfota.classList.add('invisible');
      button.classList.add('invisible');
      
    } else {
      button.classList.add('invisible');
    }
  }

  function loadDeviceInfo() {
    path = `./api/infoblock?t=${getSelectElem('type').value}`
    const infoblock = document.querySelector('#infoblock');
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          infoblock.innerHTML= JSON.parse(xhr.responseText).info;
        }
        else {
          error(xhr);
        }
      }
    };
    xhr.open('GET', path, true);
    xhr.send();

  }

  function loadVersionInfo() {
    verblock = document.querySelector('#fwverblock');
    manageReleaseNotes(verblock);
    manageBuildDate(verblock);
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
    path = `./api/versions?t=${getSelectElem('type').value}`
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          versions = JSON.parse(xhr.responseText).versions;
          dates = JSON.parse(xhr.responseText).dates;
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