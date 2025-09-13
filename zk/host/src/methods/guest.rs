use risc0_zkvm::sha::Digest;

pub const GUEST_ELF: &[u8] = include_bytes!("../../../target/riscv32im-risc0-zkvm-elf/release/guest");

// Compute image ID at runtime since it can't be done at compile time
pub fn guest_id() -> Digest {
    risc0_binfmt::compute_image_id(GUEST_ELF).unwrap()
}