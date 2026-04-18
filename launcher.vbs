Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Sayan\Desktop\photo identifier"
WshShell.Run "cmd /c npm start", 0
