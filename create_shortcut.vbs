Set ws = CreateObject("WScript.Shell")
Set shortcut = ws.CreateShortcut(ws.SpecialFolders("Desktop") & "\Seal Pet.lnk")
shortcut.TargetPath = "C:\Users\Sofiyko\Desktop\Котик\Seal Pet.bat"
shortcut.WorkingDirectory = "C:\Users\Sofiyko\Desktop\Котик"
shortcut.WindowStyle = 7
shortcut.Description = "Launch Seal Desktop Pet"
shortcut.Save
