' Abre Rankings Scarlett (ventana WebView2). El servidor queda en 127.0.0.1:5002.
Option Explicit
Dim shell, fso, base, script, py, pyw, cmd, rc, logDir, logFile, ts
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
script = base & "\scripts\ventana_ranking.py"
shell.CurrentDirectory = base

If Not fso.FileExists(script) Then
  MsgBox "No encuentro el lanzador:" & vbCrLf & script, vbCritical, "Rankings Scarlett"
  WScript.Quit 1
End If

pyw = ""
If fso.FileExists("C:\Python314\pythonw.exe") Then
  pyw = "C:\Python314\pythonw.exe"
ElseIf fso.FileExists("C:\Python313\pythonw.exe") Then
  pyw = "C:\Python313\pythonw.exe"
Else
  pyw = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\Python\Python314\pythonw.exe")
  If Not fso.FileExists(pyw) Then pyw = "pythonw"
End If

py = Replace(pyw, "pythonw.exe", "python.exe")
If Not fso.FileExists(py) Then py = Replace(pyw, "pythonw", "python")

logDir = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\RankingApp"
If Not fso.FolderExists(logDir) Then fso.CreateFolder logDir
logFile = logDir & "\launcher.log"
ts = Now
On Error Resume Next
Dim tsLog
Set tsLog = fso.OpenTextFile(logFile, 8, True)
tsLog.WriteLine CStr(ts) & "  Abriendo con " & pyw
tsLog.Close
On Error GoTo 0

cmd = """" & pyw & """ """ & script & """"
rc = shell.Run(cmd, 0, True)
If rc <> 0 Then
  On Error Resume Next
  Set tsLog = fso.OpenTextFile(logFile, 8, True)
  tsLog.WriteLine CStr(Now) & "  pythonw falló (rc=" & rc & "), probando python visible"
  tsLog.Close
  On Error GoTo 0
  cmd = """" & py & """ """ & script & """"
  rc = shell.Run(cmd, 1, True)
End If

If rc <> 0 Then
  MsgBox "No pude abrir Rankings Scarlett." & vbCrLf & vbCrLf & _
    "Python usado: " & pyw & vbCrLf & _
    "Log: " & logFile & vbCrLf & vbCrLf & _
    "Prueba también: ranking-app\ABRIR_RANKINGS.bat", vbCritical, "Rankings Scarlett"
  WScript.Quit CInt(rc)
End If