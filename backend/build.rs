fn main() {
    // `include_dir!` doesn't track added or removed files, so rebuild whenever content/ changes.
    println!("cargo::rerun-if-changed=../content");
}
