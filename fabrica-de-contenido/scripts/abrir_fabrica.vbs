' Abre la Fabrica como ventana propia, sin pestanas del navegador.
Option Explicit
Dim shell, fso, base, http, ok, chrome, perfil, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = base

ok = False
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.setTimeouts 1500, 1500, 1500, 1500
http.Open "GET", "http://127.0.0.1:5001/health", False
http.Send
If Err.Number = 0 Then
  If http.Status = 200 Then ok = True
End If
Err.Clear
On Error GoTo 0

If Not ok Then
  shell.Run "cmd /c python -m uvicorn worker.app:app --host 127.0.0.1 --port 5001", 0, False
  WScript.Sleep 3500
End If

chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
If Not fso.FileExists(chrome) Then
  chrome = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
End If

perfil = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\FabricaDeContenido\perfil"
cmd = """" & chrome & """ --app=http://127.0.0.1:5001/ --user-data-dir=""" & perfil & """ --no-first-run --no-default-browser-check --disable-session-crashed-bubble"
shell.Run cmd, 1, False
