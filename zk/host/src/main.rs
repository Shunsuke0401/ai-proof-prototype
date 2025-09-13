use clap::Parser;
use risc0_zkvm::{default_prover, ExecutorEnv};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

// Include the guest binary
risc0_zkvm::include_image!("guest");

#[derive(Serialize, Deserialize, Debug)]
struct Keyword {
    word: String,
    count: u32,
}

#[derive(Serialize, Deserialize, Debug)]
struct JournalOutput {
    #[serde(rename = "programHash")]
    program_hash: String,
    #[serde(rename = "inputHash")]
    input_hash: String,
    #[serde(rename = "outputHash")]
    output_hash: String,
    keywords: Vec<Keyword>,
}

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Input text file
    #[arg(long)]
    input: PathBuf,
    
    /// Output journal JSON file
    #[arg(long)]
    out: PathBuf,
    
    /// Output proof binary file
    #[arg(long)]
    proof: PathBuf,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    
    // Read input text
    let input_text = fs::read_to_string(&args.input)
        .map_err(|e| format!("Failed to read input file: {}", e))?;
    
    // Create executor environment with stdin
    let env = ExecutorEnv::builder()
        .write_slice(&input_text.as_bytes())
        .build()
        .map_err(|e| format!("Failed to build executor environment: {}", e))?;
    
    // Get the default prover
    let prover = default_prover();
    
    // Execute the guest program and generate proof
    let receipt = prover
        .prove(env, GUEST_ELF)
        .map_err(|e| format!("Failed to prove: {}", e))?;
    
    // Verify the receipt
    receipt
        .verify(GUEST_ID)
        .map_err(|e| format!("Failed to verify receipt: {}", e))?;
    
    // Extract journal from receipt
    let journal: JournalOutput = receipt
        .journal
        .decode()
        .map_err(|e| format!("Failed to decode journal: {}", e))?;
    
    // Fill in the actual program hash (image ID)
    let program_hash = format!("{:x}", GUEST_ID);
    let final_journal = JournalOutput {
        program_hash,
        input_hash: journal.input_hash,
        output_hash: journal.output_hash,
        keywords: journal.keywords,
    };
    
    // Ensure output directories exist
    if let Some(parent) = args.out.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }
    if let Some(parent) = args.proof.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create proof directory: {}", e))?;
    }
    
    // Write journal to file
    let journal_json = serde_json::to_string_pretty(&final_journal)
        .map_err(|e| format!("Failed to serialize journal: {}", e))?;
    fs::write(&args.out, journal_json)
        .map_err(|e| format!("Failed to write journal file: {}", e))?;
    
    // Write proof to file
    let proof_bytes = risc0_binfmt::encode(&receipt)
        .map_err(|e| format!("Failed to encode receipt: {}", e))?;
    fs::write(&args.proof, proof_bytes)
        .map_err(|e| format!("Failed to write proof file: {}", e))?;
    
    println!("ZK proof generated successfully!");
    println!("Journal: {}", args.out.display());
    println!("Proof: {}", args.proof.display());
    println!("Program Hash: {}", final_journal.program_hash);
    
    Ok(())
}