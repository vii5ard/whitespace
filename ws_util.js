globalThis.ws_util = (function () {
  return {
    isLocalLabel: function (label) {
      return label.match(/^\..*$/);
    },

    getWsUnsignedNumber: function (num) {
      let result = "";
      while (num > 0n) {
        result = ((num % 2n) ? '\t' : ' ') + result;
        num = num / 2n;
      }
      return result + '\n';
    },

    getWsSignedNumber: function (num) {
      return ((num >= 0n) ? ' ' : '\t') + (num === 0n ? '\n' : this.getWsUnsignedNumber(num < 0n ? -1n * num : num));
    },

    labelTransformer: function (labelGenerator) {
      let length = 0n;
      return {
        length: length,
        labels: {},
        getLabel: function (label) {
          if (typeof label != "undefined" && label in this.labels) {
            return this.labels[label];
          } else {
            const gen = labelGenerator(length++, label);
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
          const next = this.arr[this.pos++];
          if (next === '\n') {
            this.line++;
            this.col = 1;
          } else {
            this.col++;
          }
          return next;
        },
        peek:  function (off)  {
          const pos = this.pos + (off || 0);
          if (this.arr.length < pos) {
            return -1; // TODO! Any alternative that is not an exception?
          }
          return this.arr[pos];
        }
      }
    }
  };
})();
