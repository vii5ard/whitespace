globalThis.ws_util = (function () {
  return {
    isLocalLabel: function (label) {
      return /^\..*$/.test(label);
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
          if (label != null && label in this.labels) {
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
        arr: [...str],
        offset: 0,
        line: 1,
        col: 1,
        pos: function () {
          return { line: this.line, col: this.col };
        },
        hasNext: function () {
          return this.offset < this.arr.length;
        },
        getNext: function () {
          const next = this.arr[this.offset++];
          if (next === '\n') {
            this.line++;
            this.col = 1;
          } else {
            this.col++;
          }
          return next;
        },
        peek: function (seek) {
          const offset = this.offset + (seek || 0);
          return this.arr[offset];
        }
      };
    }
  };
})();
