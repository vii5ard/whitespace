    // Source from http://forumsblogswikis.com/2008/07/20/how-to-insert-tabs-in-a-textarea/
    function insertAtCursor(myField, myValue) {
      //IE support
      if (document.selection) {
        myField.focus();
        sel = document.selection.createRange();
        sel.text = myValue;
      }
      //MOZILLA/NETSCAPE support
      else if (myField.selectionStart || myField.selectionStart == '0') {
        var startPos = myField.selectionStart;
        var endPos = myField.selectionEnd;
        restoreTop = myField.scrollTop;
        myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
        myField.selectionStart = startPos + myValue.length;
        myField.selectionEnd = startPos + myValue.length;
        if (restoreTop>0) {
          myField.scrollTop = restoreTop;
        }
      } else {
        myField.value += myValue;
      }
    }
    function interceptTabs(evt, control) {
      key = evt.keyCode ? evt.keyCode : evt.which ? evt.which : evt.charCode;
      if (key==9) {
        insertAtCursor(control, '\t');
        return false;
      } else {
        return key;
      }
    }

