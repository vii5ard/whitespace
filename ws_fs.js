globalThis.ws_fs = function(metaFile) {
  const isValidFileName = function (fileName) {
    return /^[a-zA-z0-9._() \/-]+$/.test(fileName);
  };

  const flush = function (files) {
    const local = {files: {}};
    for (const fileName in files) {
      const file = files[fileName];
      if (!file.extFile) {
        local.files[fileName] = file;
      }
    }
    localStorage.ws_fs = JSON.stringify(local);
  };

  const handleFiles = function (data, files, extFile) {
    let json;
    try {
      json = JSON.parse(data);
    } catch (err) {
      console.log("Unable to parse JSON: " + err);
    }
    for (const fileName in json.files) {
      if (isValidFileName(fileName)/* && !(fileName in files)*/) {
        const file = json.files[fileName];
        file.extFile = extFile;
        file.name = fileName;
        files[fileName] = file;
      }
    }
  };

  const loadFilesServer = function (files) {
    $.ajax({
      url: metaFile,
      converters: {"text json": window.String},
      success: function (data) {
        handleFiles(data, files, true);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.log("Unable to read '" + metaFile + "': " + textStatus);
      },
      async: false
    });
  };

  const loadFilesLocal = function (files) {
    if (typeof localStorage === "undefined") {
      console.log("Local storage not supported!");
      return;
    }
    const data = localStorage.ws_fs || "{}";
    handleFiles(data, files, false);
  };

  const loadFiles = function () {
    const files = {};

    loadFilesLocal(files);
    loadFilesServer(files);

    return files;
  };

  const self = {
    files: loadFiles(),
    getFile: function (fileName) {
      return self.files[fileName];
    },
    rename: function (oldName, newName) {
      if (oldName === newName) return;
      if (!(oldName in self.files) || newName in self.files) {
        console.log("Won't replace file!");
        return;
      }
      if (!isValidFileName(newName)) {
        console.log("Not a valid file name: '" + newName + "'");
        return;
      }
      delete self.fileNames; // Empty cache
      const file = self.files[oldName];

      file.name = newName;
      file.extFile = false;

      /* Update file language. */
      if (/\.ws$/.test(file.name)) {
        file.lang = "WS";
      } else if (/\.wsa$/.test(file.name)) {
        file.lang = "WSA";
      } else {
        file.lang = "OTHER";
      }
      self.files[newName] = file;
      delete self.files[oldName];
      flush(self.files);
    },
    openFile: function (file) {
      if (file.src || !file.extFile) {
        return file.src;
      } else if (file.file) {
        $.ajax({
          url: file.file,
          async: false,
          success: function (data) {
            file.src = data;
          },
          error: function () {
            console.log("Unable to load file: '" + file.file + "'");
          }
        });
        return file.src;
      } else {
        console.log("Unable to open file: '" + JSON.stringify(file));
      }
    },
    deleteFile: function (fileName) {
      delete self.fileNames;
      delete self.files[fileName];
      flush(self.files);
    },
    getFileNames: function (pattern) {
      self.fileNames = [];
      for (const fileName in self.files) {
        if (!pattern || pattern.test(fileName)) {
          self.fileNames.push(fileName);
        }
      }
      self.fileNames.sort();
      return self.fileNames;
    },
    saveFile: function (file) {
      self.files[file.name] = file;
      file.extFile = false;
      flush(self.files);
    }
  };

  return self;
}("example/meta.json");
