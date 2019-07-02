var ws_fs = function(metaFile) {
  var isValidFileName = function(fileName) {
    return true && fileName.match(/^[a-zA-z0-9._() \/-]+$/);
  };

  var flush = function(files) {
    var local = {files: {}};
    for (var fileName in files) {
      var file = files[fileName];
      if (!file.extFile) {
        local.files[fileName] = file;
      }
    }
    localStorage.ws_fs = JSON.stringify(local);
  }

  var handleFiles = function(data, files, extFile) {
    try {
      var json = JSON.parse(data);
    } catch (err) {
      console.log("Unable to parse JSON: " + err);
    }
    for (fileName in json.files) {
      if (isValidFileName(fileName) && !(fileName in files)) {
        var file = json.files[fileName];
        file.extFile = extFile;
        file.name = fileName;
        files[fileName] = file;
      }
    } 
  };
 
  var loadFilesServer = function(files) {
    $.ajax({
      url: metaFile,
      converters: {"text json": window.String},
      success: function (data) {
        handleFiles(data, files, true);
     },
     error: function(jqXHR, textStatus, errorThrown) {
       console.log("Unable to read '" + metaFile + "': " + textStatus);
     },
     async: false      
    });
  };

  var loadFilesLocal = function(files) {
    if (typeof localStorage == "undefined") {
      console.log("Local storage not supported!");
      return;
    }
    var data = localStorage.ws_fs || "{}";
    handleFiles(data, files, false);
  }

  var loadFiles = function() {
    var files = {};

    loadFilesServer(files);
    loadFilesLocal(files);

    return files;
  };

  var self = {
    files: loadFiles(),
    getFile: function(fileName) {
      return self.files[fileName];
    },
    rename: function(oldName, newName) {
      if (oldName == newName) return;
      if (!(oldName in self.files) || newName in self.files) {
        console.log("Won't replace file!");
        return;
      }
      if (!isValidFileName(newName)) {
        console.log("Not a valid file name: '" + newName + "'.");
        return;
      }
      delete self.fileNames; // Empty cache
      var file = self.files[oldName];

      file.name = newName;


      /* Update file language. */
      if (file.name.match(/\.ws$/)) {
        file.lang = "WS";
      } else if (file.name.match(/\.wsa$/)) {
        file.lang = "WSA";
      } else {
        file.lang = "OTHER";
      }
      self.files[newName] = file;
      delete self.files[oldName];
      flush(self.files); 
    },
    openFile: function(file) {
      if (file.src || !file.extFile) {
        return file.src;
      } else if (file.file) {
        $.ajax({
          url:file.file,
          async: false,
          success: function (data) {
            file.src = data;
          },
          error: function () {
            console.log("Unable to load file: '" + file.file + "'.");
          }
        });
        return file.src;
      } else {
        console.log("Unable to open file: '" + JSON.stringify(file));
      }
    },
    deleteFile: function(fileName) {
      delete self.fileNames;
      delete self.files[fileName];
      flush(self.files);
    },
    getFileNames: function(pattern) {
      // if (self.fileNames) return self.fileNames;
      self.fileNames = [];
      for (fileName in self.files) {
        if (!pattern || fileName.match(pattern)) {
          self.fileNames.push(fileName);
        }
      }
      self.fileNames.sort();
      return self.fileNames;
    },
    saveFile: function(file) {
      self.files[file.name] = file;
      flush(self.files);
    }
  };

  return self;
}("example/meta.json");
