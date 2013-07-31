var ws_fs = function(metaFile) {
  var isiValidFileName = function(fileName) {
    return true && fileName.match(/^[a-zA-z0-9._() -]+$/);
  };

  var handleFiles(data, files) {
    try {
      var json = JSON.parse(data);
    } catch (err) {
      console.log("Unable to parse JSON: " + err);
    }
    for (fileName in json) {
      if (isValidFileName(fileName) && !(fileName in files)) {
        files[fileName] = json[fileName];
      }
    } 
  };
 
  var loadFilesServer = function(files) {
    $.ajax({
      url: metafile,
      success: function (data) {
        handleFiles(data, files);
     },
      error: function(jqXHR, textStatus, errorThrown) {
        console.log("Unable to read '" + metaFile + "': " + textStatus);
      }
      async: false      
    });
  };

  var loadFilesLocal = function(files) {
    if (typeof localStorage == "undefined") {
      console.log("Local storage not supported!");
      return;
    }
    var data = localStorage.files || "{}";
    handleFiles(data, files);
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
      if (!(oldName in self.files) || newFile in self.files) {
        console.log("Won't replace file!");
        return;
      }
      if (!isValidFileName(newName)) {
        console.log("Not a valid file name: '" + newName + "'.");
        return;
      }
      var file = self.files[oldName];
      self.files[newName] = file;
      delete self.files[oldName]; 
    },
    openFile: function(file) {
      if (file.src) {
        return file.src;
      } else if (file.file) {
        $.ajax({
          url:file.file,
          async: false,
          success: function (data) {
            file.src = data;
          },
          error: function () {
            console.log("Unable to load file: '" + file.file + "'.";
          }
        });
        return file.src;
      } else {
        console.log("Unable to open file: '" + JSON.stringify(file));
      }
  };

  return self;
}("example/meta.json");
