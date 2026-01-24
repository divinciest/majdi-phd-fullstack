"""
Unified Coordinate Space for PDF Analysis

Normalizes all PDFs into a single [0,1] × [0,1] coordinate system
for spatial constraint learning and hallucination detection.
"""
import fitz  # PyMuPDF
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import json


@dataclass
class CoordinatePoint:
    """A single text element with normalized coordinates"""
    text: str
    x_norm: float  # [0, 1]
    y_norm: float  # [0, 1]
    x_abs: float
    y_abs: float
    page: int
    paper: str
    bbox: tuple  # (x0, y0, x1, y1)


class UnifiedCoordinateSpace:
    """Normalize all PDFs into single [0,1] × [0,1] coordinate space"""
    
    def __init__(self):
        self.all_words: List[CoordinatePoint] = []
        self.papers: Dict[str, List[CoordinatePoint]] = {}
    
    def add_paper(self, pdf_path: str) -> int:
        """
        Extract and normalize coordinates from PDF
        
        Returns: Number of words extracted
        """
        try:
            doc = fitz.open(pdf_path)
        except Exception as e:
            print(f"Error opening {pdf_path}: {e}")
            return 0
        
        paper_words = []
        
        for page_num, page in enumerate(doc):
            # Get page bounds
            rect = page.rect
            page_width = rect.width
            page_height = rect.height
            
            if page_width == 0 or page_height == 0:
                continue
            
            # Extract words with coordinates
            words = page.get_text("words")
            
            for word_data in words:
                x0, y0, x1, y1, word = word_data[:5]
                
                coord_point = CoordinatePoint(
                    text=word,
                    x_norm=(x0 + x1) / 2 / page_width,
                    y_norm=(y0 + y1) / 2 / page_height,
                    x_abs=(x0 + x1) / 2,
                    y_abs=(y0 + y1) / 2,
                    page=page_num,
                    paper=pdf_path,
                    bbox=(x0, y0, x1, y1)
                )
                
                paper_words.append(coord_point)
        
        doc.close()
        
        # Store by paper
        self.papers[pdf_path] = paper_words
        self.all_words.extend(paper_words)
        
        return len(paper_words)
    
    def get_all_coordinates(self) -> List[CoordinatePoint]:
        """Return all coordinates in unified space"""
        return self.all_words
    
    def get_paper_coordinates(self, pdf_path: str) -> List[CoordinatePoint]:
        """Get coordinates for specific paper"""
        return self.papers.get(pdf_path, [])
    
    def find_value_in_pdf(self, value: Any, fuzzy: bool = True) -> Optional[CoordinatePoint]:
        """
        Binary search: Is value found in any PDF?
        
        Args:
            value: Value to search for
            fuzzy: Allow . vs , variations
        
        Returns: CoordinatePoint if found, None otherwise
        """
        value_str = str(value).strip()
        
        # Exact match
        for word in self.all_words:
            if word.text == value_str:
                return word
        
        # Fuzzy match (. vs ,)
        if fuzzy:
            fuzzy_value = value_str.replace(".", ",")
            for word in self.all_words:
                word_text_normalized = word.text.replace(",", ".")
                value_normalized = value_str.replace(",", ".")
                
                if word_text_normalized == value_normalized:
                    return word
        
        return None
    
    def check_text_exists(self, value: Any, fuzzy: bool = True) -> bool:
        """
        Binary check: Is value in any PDF text?
        
        Returns: True if found, False if not found (hallucinated)
        """
        return self.find_value_in_pdf(value, fuzzy) is not None
    
    def save_to_json(self, filepath: str):
        """Save coordinate space to JSON"""
        data = {
            "total_words": len(self.all_words),
            "papers": list(self.papers.keys()),
            "coordinates": [
                {
                    "text": w.text,
                    "x_norm": w.x_norm,
                    "y_norm": w.y_norm,
                    "page": w.page,
                    "paper": w.paper
                }
                for w in self.all_words
            ]
        }
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    
    @classmethod
    def load_from_json(cls, filepath: str) -> 'UnifiedCoordinateSpace':
        """Load coordinate space from JSON"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        space = cls()
        
        for coord in data['coordinates']:
            point = CoordinatePoint(
                text=coord['text'],
                x_norm=coord['x_norm'],
                y_norm=coord['y_norm'],
                x_abs=0,  # Not saved
                y_abs=0,
                page=coord['page'],
                paper=coord['paper'],
                bbox=(0, 0, 0, 0)
            )
            space.all_words.append(point)
            
            # Group by paper
            if coord['paper'] not in space.papers:
                space.papers[coord['paper']] = []
            space.papers[coord['paper']].append(point)
        
        return space


if __name__ == "__main__":
    # Test
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python unified_space.py <pdf_path>")
        sys.exit(1)
    
    space = UnifiedCoordinateSpace()
    count = space.add_paper(sys.argv[1])
    
    print(f"Extracted {count} words from PDF")
    print(f"Normalized coordinates to [0,1] × [0,1]")
    
    # Test text search
    if len(sys.argv) > 2:
        test_value = sys.argv[2]
        found = space.check_text_exists(test_value)
        print(f"\nSearching for '{test_value}': {'FOUND' if found else 'NOT FOUND'}")
