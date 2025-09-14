pub const GUEST_ELF: &[u8] = include_bytes!("../../target/riscv32im-risc0-zkvm-elf/release/guest");
pub const GUEST_ID: [u32; 8] = risc0_zkvm::compute_image_id(GUEST_ELF);