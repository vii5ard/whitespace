var ws_util = (function () {
  return {
    isLocalLabel: function (label) {
      return label.match(/^\..*$/);
    },

    getWsUnsignedNumber: function (num) {
      var result = "";
      while (num > 0) {
        result = ((num % 2) ? '\t' : ' ') + result;
        num = Math.floor(num / 2);
      }
      return result + '\n';
    },

    getWsSignedNumber: function (num) {
      return ((num >= 0) ? ' ' : '\t') + (num == 0 ? '\n' : this.getWsUnsignedNumber(Math.abs(num)));
    },

    labelTransformer: function (labelGenerator) {
      var length = 0;
      return {
        length: length,
        labels: {},
        getLabel: function (label) {
          if (typeof label != "undefined" && label in this.labels) {
            return this.labels[label];
          } else {
            var gen = labelGenerator(length++, label);
            this.labels[label] = gen;
            return gen;
          }
        }
      };
    },

    getFilename: function (path) {
      return path.replace(/^(?:.*[\/\\])?((?:[^\/\\])*)$/, '$1');
    },

    StrArr: function(str) {
      return {
        arr: str.split(''),
        pos: 0,
        line: 1,
        col: 1,
        hasNext: function  () {
          return this.pos  < this.arr.length;
        },
        getNext: function  () {
          var next = this.arr[this.pos++];
          if (next == '\n') {
            this.line++;
            this.col = 1;
          } else {
            this.col++;
          }
          return next;
        },
        peek:  function (off)  {
          var pos = this.pos + (off || 0);
          if (this.arr.length < pos) {
            return -1; // TODO! Any alternative that is not an exception?
          }
          return this.arr[pos];
        }
      }
    }
  };
})();
