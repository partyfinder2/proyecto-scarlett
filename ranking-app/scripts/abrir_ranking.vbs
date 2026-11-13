' Abre Rankings Scarlett (ventana WebView2). El servidor queda en 127.0.0.1:5002.
Option Explicit
Dim shell, fso, base, script, codigo
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
script = base & "\scripts\ventana_ranking.py"
shell.CurrentDirectory = base

codigo = shell.Run("pythonw -c ""import sys""", 0, True)
If codigo = 0 Then
  shell.Run "pythonw """ & script & """", 0, False
Else
  shell.Run "python """ & script & """", 1, False
End If
