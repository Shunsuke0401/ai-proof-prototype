use clap::{Arg, Command};
use risc0_zkvm::{default_prover, ExecutorEnv};
use serde_json;
use std::fs;
use std::path::Path;
use std::process;

// Include the guest methods
mod methods;
use methods::{GUEST_ELF, guest_id};

fn main() {
    let matches = Command::new("zkhost")
        .about("RISC Zero host runner for deterministic summarization")
        .arg(
            Arg::new("input")
                .long("in")
                .value_name("FILE")
                .help("Input text file")
                .required(true),
        )
        .arg(
            Arg::new("output")
                .long("out")
                .value_name("FILE")
                .help("Output journal JSON file")
                .required(true),
        )
        .arg(
            Arg::new("proof")
                .long("proof")
                .value_name("FILE")
                .help("Output proof binary file")
                .required(true),
        )
        .get_matches();

    let input_file = matches.get_one::<String>("input").unwrap();
    let output_file = matches.get_one::<String>("output").unwrap();
    let proof_file = matches.get_one::<String>("proof").unwrap();

    // Read input file bytes
    let input_bytes = match fs::read(input_file) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("Error reading input file '{}': {}", input_file, e);
            process::exit(1);
        }
    };

    // Create execution environment with input data
    let env = ExecutorEnv::builder()
        .write(&input_bytes)
        .unwrap()
        .build()
        .unwrap();
    
    // Generate the proof using real prover (not dev mode)
    println!("🔄 Generating ZK proof...");
    let prover = default_prover();
    let prove_info = prover
        .prove(env, GUEST_ELF)
        .unwrap();
    
    // Extract journal data from the receipt
    let journal_bytes = prove_info.journal.bytes.clone();
    let journal_str = String::from_utf8(journal_bytes)
        .expect("Journal should contain valid UTF-8");
    let journal_data: serde_json::Value = serde_json::from_str(&journal_str)
        .expect("Journal should contain valid JSON");
    
    // Create output directory if it doesn't exist
    if let Some(parent) = Path::new(output_file).parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            eprintln!("Error creating output directory: {}", e);
            process::exit(1);
        }
    }
    if let Some(parent) = Path::new(proof_file).parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            eprintln!("Error creating proof directory: {}", e);
            process::exit(1);
        }
    }
    
    // Write journal data
    let journal_json = serde_json::to_string_pretty(&journal_data).unwrap();
    let journal_json_len = journal_json.len();
    
    if let Err(e) = fs::write(&output_file, journal_json) {
        eprintln!("Error writing journal file '{}': {}", output_file, e);
        process::exit(1);
    }
    
    // Write the seal as proof (this is the actual ZK proof)
    let proof_bytes = prove_info.inner.seal().to_vec();
    if let Err(e) = fs::write(&proof_file, &proof_bytes) {
        eprintln!("Error writing proof file '{}': {}", proof_file, e);
        process::exit(1);
    }
    
    println!("✅ ZK proof generated successfully!");
    println!("📄 Journal: {} ({} bytes)", output_file, journal_json_len);
    println!("🔒 Proof: {} ({} bytes)", proof_file, proof_bytes.len());
    
    // Convert guest ID to hex string
    let guest_id_digest = guest_id();
    println!("🎯 Image ID: {}", guest_id_digest);
}