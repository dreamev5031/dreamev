All case post markdown files should strictly adhere to the following schema:

1. **MD File Path**: `public/content/cases/[filename].md`
2. **Category**: Must be one of the following (in Korean):
   - "산업용"
   - "농업용"
   - "다목적"
   - "맞춤제작"
   (No other categories are allowed.)
3. **Mandatory YAML Front Matter (exact format)**:
   ```yaml
   ---
   title: [Post Title]
   category: [One of the 4 allowed categories]
   gallery:
     - image: /images/[image file name.webp]
   date: 2026-02-20T12:00:00.000+09:00
   ---
   ```
4. **Content**:
   - The body of the post must only contain plain text.
   - No markdown image tags (e.g., `![image]()`)

All future case posts must adhere to this schema.