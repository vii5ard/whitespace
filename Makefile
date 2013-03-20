FILES=ws_ide.{js,html,css} jquery.js ws_core.js ws_optimizer.js example/*

release:
	zip ws_ide.zip $(FILES)

publish:
	scp $(FILES) math:public_html/ws_ide
