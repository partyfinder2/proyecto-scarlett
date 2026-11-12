' Arranque diario: Electron ya compilado, sin consola y sin recompilar.
Option Explicit
Dim sh, fso, base, electron, mainJs
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base
mainJs = base & "\dist\main\main.js"
electron = base & "\node_modules\electron\dist\electron.exe"

If Not fso.FileExists(mainJs) Then
  MsgBox "BabelDesk todavía no está compilado." & vbCrLf & vbCrLf & "En esta carpeta, una sola vez:" & vbCrLf & "npm run build", vbExclamation, "BabelDesk"
  WScript.Quit 1
End If
If Not fso.FileExists(electron) Then
  MsgBox "Falta Electron." & vbCrLf & vbCrLf & "En esta carpeta, una sola vez:" & vbCrLf & "npm install", vbExclamation, "BabelDesk"
  WScript.Quit 1
End If

sh.Run """" & electron & """ """ & base & """", 0, False
