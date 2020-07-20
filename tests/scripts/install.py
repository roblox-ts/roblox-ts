# https://github.com/OrbitalOwen/roblox-win-installer

import os
import sys
import wget
import subprocess
import time
import psutil
import winreg  # pylint: disable=import-error
import pathlib
import shutil


def log(string):
    print(string, flush=True)


def retryUntilSuccess(func):
    while True:
        try:
            func()
            return
        except:
            time.sleep(0.1)


def getProcessPath(processName):
    for proc in psutil.process_iter():
        try:
            if processName.lower() in proc.name().lower():
                return proc.exe()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass


def downloadStudioLauncher():
    log('Downloading Studio')
    launcherPath = os.path.join(sys.path[0], 'RobloxStudioLauncherBeta.exe')
    url = 'http://setup.roblox.com/RobloxStudioLauncherBeta.exe'
    wget.download(url, launcherPath)
    return launcherPath


def launchProcess(executablePath):
    log('Launching {}'.format(executablePath))
    subprocess.Popen([executablePath])


def installStudio(launcherPath):
    log('Installing Studio')
    launchProcess(launcherPath)
    while True:
        # When RobloxStudioBeta.exe is running, the installer has completed
        path = getProcessPath('RobloxStudioBeta.exe')
        if path:
            return path
        time.sleep(1)


# Method inspired by: https://github.com/jeparlefrancais/run-in-roblox-ci
def loginToStudio():
    log('Logging into Studio')

    # These keys aren't created until studio's first run, keep retrying until they have been

    def func():
        key = "SEC::<YES>,EXP::<9999-01-01T00:00:00Z>,COOK::<{}>".format(
            sys.argv[1])

        reg_robloxDotCom = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r'Software\\Roblox\\RobloxStudioBrowser\\roblox.com', access=winreg.KEY_WRITE)
        winreg.SetValueEx(reg_robloxDotCom,
                          r'.ROBLOSECURITY', 0, winreg.REG_SZ, key)
        winreg.CloseKey(reg_robloxDotCom)

    retryUntilSuccess(func)


def requestKillStudioProcess():
    log('Sending terminate signal to RobloxStudioBeta')
    os.system("taskkill /im RobloxStudioBeta.exe")


def forceKillStudioProcess():
    log('Forcefully terminate RobloxStudioBeta.exe')
    for proc in psutil.process_iter():
        if proc.name() == "RobloxStudioBeta.exe":
            proc.kill()


def waitForContentPath():
    log('Waiting for the content path to be registered')

    # The content path is used by applications like run-in-roblox to identify Studio's install directory
    # These keys aren't created until studio closes, so keep retrying until they exist

    def func():
        regKey = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r'Software\\Roblox\\RobloxStudio', access=winreg.KEY_READ)
        winreg.QueryValueEx(regKey, r'ContentFolder')
        winreg.CloseKey(regKey)

    retryUntilSuccess(func)


def createPluginsDirectory():
    log('Creating plugins directory')

    # The plugins directory isn't created during the install process
    # Tools like run-in-roblox need this, so let's create it
    userDir = pathlib.Path.home()
    pluginsDir = os.path.join(userDir, "AppData", "Local", "Roblox", "Plugins")
    if not os.path.isdir(pluginsDir):
        os.makedirs(pluginsDir)


def removeAutoSaveDirectory():
    log('Deleting AutoSave directory if present')

    # Required in cases where roblox has been previously installed & used
    # Removing this folder prevents the auto-save recovery dialogue from appearing
    userDir = pathlib.Path.home()
    autoSavesDir = os.path.join(userDir, "Documents", "ROBLOX", "AutoSaves")
    if os.path.isdir(autoSavesDir):
        shutil.rmtree(autoSavesDir)


def createSettingsFile():
    log('Creating settings file')

    # We want this to run fast, so let's turn the graphics down (disabling prevents run-in-roblox from working)
    # The settings file isn't created until the settings window is closed, so we'll need to use our own
    # Studio doesn't recognize %UserProfile% so we need to replace it in our template

    userDir = pathlib.Path.home()

    templateFile = open(os.path.join(sys.path[0], "GlobalSettings_13.xml"), "r")
    templateString = templateFile.read()
    templateFile.close()

    userDirString = str(userDir).replace("\\", "/")
    processedString = templateString.replace("%UserProfile%", userDirString)

    settingsDir = os.path.join(
        userDir, "AppData", "Local", "Roblox", "GlobalSettings_13.xml")
    settingsFile = open(settingsDir, "w")
    settingsFile.write(processedString)
    settingsFile.close()


launcherPath = downloadStudioLauncher()
studioPath = installStudio(launcherPath)
loginToStudio()
launchProcess(studioPath)
requestKillStudioProcess()
waitForContentPath()
createPluginsDirectory()
removeAutoSaveDirectory()
createSettingsFile()
time.sleep(5)
forceKillStudioProcess()

log('Roblox Studio has been installed')
