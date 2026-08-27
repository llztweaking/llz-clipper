use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;

#[tauri::command]
pub fn get_hwid() -> Result<String, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let cryptography = hklm
        .open_subkey("SOFTWARE\\Microsoft\\Cryptography")
        .map_err(|e| e.to_string())?;
    let machine_guid: String = cryptography
        .get_value("MachineGuid")
        .map_err(|e| e.to_string())?;
    Ok(machine_guid)
}
