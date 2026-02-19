import os
from PIL import Image

# 웹에서 쓰는 이미지는 public 안에 있어야 함 (choose image / 사이트에서 노출)
# 기본: public/images/work (깃허브 올릴 때도 이 경로에 넣기)
_base = os.path.dirname(os.path.abspath(__file__))
target_folder = os.path.join(_base, '..', 'public', 'images', 'work')
target_folder = os.path.normpath(target_folder)

if not os.path.exists(target_folder):
    print(f"[X] 경로를 찾을 수 없습니다: {target_folder}")
else:
    print(f"[*] 변환 시작: {target_folder}")
    
    for filename in os.listdir(target_folder):
        # 변환 대상 확장자 확인
        if filename.lower().endswith((".jpg", ".jpeg", ".png")):
            file_path = os.path.join(target_folder, filename)
            
            try:
                img = Image.open(file_path)
                
                # 새 파일명 설정 (.webp)
                new_filename = os.path.splitext(filename)[0] + ".webp"
                new_path = os.path.join(target_folder, new_filename)
                
                # WebP 변환 저장 (품질 80%가 용량 대비 화질이 가장 효율적임)
                img.save(new_path, "webp", quality=80)
                
                # 원본 파일 삭제 (깃허브 용량 절약 및 중복 방지)
                os.remove(file_path)
                print(f"[OK] 완료: {filename} -> {new_filename}")
                
            except Exception as e:
                print(f"[X] {filename} 처리 중 오류 발생: {e}")

    print("\n[*] 모든 이미지의 WebP 최적화 변환이 완료되었습니다.")
