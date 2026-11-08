' Abre BabelDesk sin ventana de consola (modo dev con npm).
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\pablo\Downloads\BabelDesk"
sh.Run "cmd /c npm run dev", 0, False
