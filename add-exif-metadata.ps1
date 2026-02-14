# Add author and copyright metadata to all images in the projects folder
# Requires ExifTool to be installed (winget install OliverBetz.ExifTool)

$exiftool = "$env:LOCALAPPDATA\Programs\ExifTool\ExifTool.exe"

& $exiftool -Artist="Michael Santacroce" -Copyright="© Michael Santacroce" -overwrite_original -r "./projects"
