fn main() {
    // Check if we're in development mode or toolchain is missing
    if std::env::var("RISC0_DEV_MODE").unwrap_or_default() == "1" ||
       std::env::var("RISC0_SKIP_TOOLCHAIN_INSTALL").unwrap_or_default() == "1" {
        println!("cargo:warning=Skipping risc0_build::embed_methods() due to dev mode or missing toolchain");
        
        // Create a stub methods.rs file with required constants
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let dest_path = std::path::Path::new(&out_dir).join("methods.rs");
        let stub_content = r#"// Stub methods file for dev mode
pub const GUEST_ELF: &[u8] = &[];
pub const GUEST_ID: [u32; 8] = [0; 8];
"#;
        std::fs::write(&dest_path, stub_content).unwrap();
        
        return;
    }
    
    risc0_build::embed_methods();
}