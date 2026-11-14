' Fábrica de Contenido — ventana propia (WebView2). Sin pestañas del navegador.
Option Explicit
Dim shell, fso, base, py, script
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
script = base & "\scripts\ventana_fabrica.py"
If Not fso.FileExists(script) Then
  MsgBox "No encuentro scripts\ventana_fabrica.py en " & base, vbCritical, "Fábrica de Contenido"
  WScript.Quit 1
End If

py = "pythonw"
On Error Resume Next
shell.Run """" & py & """ """ & script & """", 1, False
If Err.Number <> 0 Then
  Err.Clear
  py = "python"
  shell.Run """" & py & """ """ & script & """", 1, False
End If
