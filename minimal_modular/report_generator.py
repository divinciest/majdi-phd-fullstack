"""
PDF Report Generator for Extraction Runs

Generates comprehensive PDF reports including:
- Run metadata and configuration
- Extracted data summary
- Validation results and metrics
- Data tables with proper layout (no overflow/overlap)
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


def _calculate_column_widths(
    columns: List[str],
    data: List[Dict[str, Any]],
    available_width: float,
    min_col_width: float = None,
    max_col_width: float = None
) -> List[float]:
    """
    Calculate optimal column widths based on content.
    Ensures no overflow by fitting all columns within available width.
    Guarantees minimum width of 15 points per column to prevent negative widths.
    """
    num_cols = len(columns)
    if num_cols == 0:
        return []
    
    # Ensure available_width is valid
    if available_width is None or available_width <= 0:
        available_width = 25 * cm  # Default A4 landscape width
    
    # Absolute minimum width per column (15 points ~ 5mm)
    absolute_min = 15
    
    # If too many columns, just divide equally
    if num_cols * absolute_min > available_width:
        # Too many columns - use equal widths at minimum
        equal_width = available_width / num_cols
        return [max(absolute_min, equal_width) for _ in columns]
    
    # Set defaults based on column count
    if min_col_width is None:
        min_col_width = max(absolute_min, min(1.5 * cm, available_width / num_cols / 2))
    if max_col_width is None:
        max_col_width = min(6 * cm, available_width / 2)
    
    # Ensure min doesn't exceed available space per column
    min_col_width = max(absolute_min, min(min_col_width, available_width / num_cols))
    
    # Calculate content-based widths (approximate)
    col_max_lengths = []
    for col in columns:
        col_str = str(col) if col else ''
        max_len = len(col_str)  # Header length
        for row in data[:20]:  # Sample first 20 rows
            val = row.get(col, '') if row else ''
            val_str = str(val) if val is not None else ''
            max_len = max(max_len, len(val_str[:50]))
        col_max_lengths.append(max(1, max_len))  # Ensure at least 1
    
    # Convert character lengths to approximate widths (4 points per char at small font)
    char_width = 4
    raw_widths = []
    for l in col_max_lengths:
        w = l * char_width
        w = max(min_col_width, min(w, max_col_width))
        raw_widths.append(w)
    
    # Scale to fit available width exactly
    total_raw = sum(raw_widths)
    if total_raw > 0:
        scale = available_width / total_raw
        widths = [max(absolute_min, w * scale) for w in raw_widths]
    else:
        # Fallback to equal widths
        widths = [available_width / num_cols] * num_cols
    
    # Ensure total equals available width
    total = sum(widths)
    if abs(total - available_width) > 0.1 and len(widths) > 0:
        diff = available_width - total
        widths[-1] = max(absolute_min, widths[-1] + diff)
    
    return widths


def _truncate_text(text: str, max_chars: int) -> str:
    """Truncate text with ellipsis if too long."""
    text = str(text) if text is not None else ''
    if max_chars is None or max_chars <= 0:
        max_chars = 50
    if len(text) > max_chars:
        return text[:max_chars-2] + '..'
    return text


def _create_data_table(
    columns: List[str],
    data: List[Dict[str, Any]],
    available_width: float,
    header_bg_color: str = '#16213e',
    row_alt_color: str = '#f5f5f5',
    font_size: int = 6,
    max_rows: int = 100
) -> Tuple[Table, int]:
    """
    Create a properly sized data table that fits within available width.
    Uses Paragraph cells for text wrapping when needed.
    Returns (table, rows_shown).
    """
    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle(
        'CellStyle',
        parent=styles['Normal'],
        fontSize=font_size,
        leading=font_size + 2,
        wordWrap='CJK'  # Enable word wrapping
    )
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontSize=font_size,
        leading=font_size + 2,
        textColor=colors.white,
        fontName='Helvetica-Bold'
    )
    
    # Ensure available_width is valid
    if available_width is None or available_width <= 0:
        available_width = 25 * cm
    
    # Calculate column widths
    col_widths = _calculate_column_widths(columns, data, available_width)
    
    # Determine max chars per column based on width (with safety check)
    max_chars_per_col = []
    for w in col_widths:
        if w is None or w <= 0:
            max_chars_per_col.append(20)
        else:
            max_chars_per_col.append(max(5, int(w / 3)))  # ~3 points per char, min 5 chars
    
    # Build table data with Paragraphs for wrapping
    table_data = []
    
    # Header row
    header_row = [Paragraph(_truncate_text(col, 30), header_style) for col in columns]
    table_data.append(header_row)
    
    # Data rows
    rows_to_show = min(len(data), max_rows)
    for entry in data[:rows_to_show]:
        row = []
        for i, col in enumerate(columns):
            val = entry.get(col, '')
            truncated = _truncate_text(val, max_chars_per_col[i])
            row.append(Paragraph(truncated, cell_style))
        table_data.append(row)
    
    # Create table
    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(header_bg_color)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), font_size),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor(row_alt_color)]),
    ]))
    
    return table, rows_to_show


def generate_run_report(
    run_data: Dict[str, Any],
    extracted_data: List[Dict[str, Any]],
    validated_data: Optional[List[Dict[str, Any]]],
    validation_report: Optional[Dict[str, Any]],
    output_path: str,
    schema_fields: Optional[List[str]] = None
) -> str:
    """
    Generate a comprehensive PDF report for an extraction run.
    Uses landscape orientation for data tables to fit more columns.
    Tables automatically split across pages without overlap.
    """
    # Determine if we need landscape based on column count
    num_columns = len(schema_fields) if schema_fields else 0
    if num_columns == 0 and extracted_data:
        sample = extracted_data[0]
        num_columns = len([k for k in sample.keys() if k not in ('__source', '__url', 'row_accept_candidate')])
    
    # Use landscape for more than 5 columns
    use_landscape = num_columns > 5
    page_size = landscape(A4) if use_landscape else A4
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=page_size,
        rightMargin=1*cm,
        leftMargin=1*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm
    )
    
    # Available width for tables
    available_width = page_size[0] - 2*cm  # Page width minus margins
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20 if use_landscape else 24,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1a1a2e')
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=15,
        spaceAfter=8,
        textColor=colors.HexColor('#16213e')
    )
    
    subheading_style = ParagraphStyle(
        'CustomSubheading',
        parent=styles['Heading3'],
        fontSize=11,
        spaceBefore=12,
        spaceAfter=6,
        textColor=colors.HexColor('#0f3460')
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=4
    )
    
    small_style = ParagraphStyle(
        'CustomSmall',
        parent=styles['Normal'],
        fontSize=7,
        textColor=colors.grey
    )
    
    elements = []
    
    # Title
    run_name = run_data.get('name', 'Extraction Run')
    elements.append(Paragraph(f"Extraction Report: {run_name}", title_style))
    elements.append(Paragraph(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        small_style
    ))
    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    elements.append(Spacer(1, 20))
    
    # Run Overview Section
    elements.append(Paragraph("1. Run Overview", heading_style))
    
    overview_data = [
        ["Property", "Value"],
        ["Run ID", run_data.get('id', 'N/A')],
        ["Name", run_data.get('name', 'N/A')],
        ["Status", run_data.get('status', 'N/A')],
        ["Source Type", run_data.get('source_type', 'N/A')],
        ["LLM Provider", run_data.get('llm_provider', 'N/A')],
        ["Sources Count", str(run_data.get('sources_count', 0))],
        ["Start Date", run_data.get('start_date', 'N/A')],
        ["Created At", run_data.get('created_at', 'N/A')],
    ]
    
    overview_table = Table(overview_data, colWidths=[4*cm, 12*cm])
    overview_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(overview_table)
    elements.append(Spacer(1, 20))
    
    # Extraction Summary Section
    elements.append(Paragraph("2. Extraction Summary", heading_style))
    
    total_extracted = len(extracted_data)
    total_validated = len(validated_data) if validated_data else 0
    validation_enabled = validation_report is not None
    
    summary_data = [
        ["Metric", "Value"],
        ["Total Entries Extracted", str(total_extracted)],
        ["Validation Enabled", "Yes" if validation_enabled else "No"],
    ]
    
    if validation_enabled:
        pass_rate = validation_report.get('summary', {}).get('overall_pass_rate', 0)
        summary_data.extend([
            ["Validated (Accepted) Entries", str(total_validated)],
            ["Rejected Entries", str(total_extracted - total_validated)],
            ["Validation Pass Rate", f"{pass_rate:.1%}" if isinstance(pass_rate, float) else str(pass_rate)],
        ])
    
    summary_table = Table(summary_data, colWidths=[6*cm, 10*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Validation Results Section (if enabled)
    if validation_enabled and validation_report:
        elements.append(Paragraph("3. Validation Results", heading_style))
        
        # Validation summary
        val_summary = validation_report.get('summary', {})
        val_summary_data = [
            ["Metric", "Value"],
            ["Total Rows Validated", str(val_summary.get('total_rows', 0))],
            ["Overall Pass Rate", f"{val_summary.get('overall_pass_rate', 0):.1%}" if isinstance(val_summary.get('overall_pass_rate', 0), float) else "N/A"],
            ["Total Rules", str(val_summary.get('total_rules', 0))],
            ["Enabled Rules", str(val_summary.get('enabled_rules', 0))],
        ]
        
        val_table = Table(val_summary_data, colWidths=[6*cm, 10*cm])
        val_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(val_table)
        elements.append(Spacer(1, 15))
        
        # Rules breakdown
        all_results = validation_report.get('all_results', [])
        if all_results:
            elements.append(Paragraph("Validation Rules", subheading_style))
            
            rules_data = [["Rule ID", "Status", "Message"]]
            for result in all_results[:20]:  # Limit to 20 rules
                status = "PASS" if result.get('passed', False) else "FAIL"
                rules_data.append([
                    result.get('rule_id', 'N/A'),
                    status,
                    result.get('message', 'N/A')[:60]
                ])
            
            rules_table = Table(rules_data, colWidths=[3*cm, 2*cm, 11*cm])
            rules_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            elements.append(rules_table)
        
        elements.append(Spacer(1, 20))
    
    # Page break before data tables
    elements.append(PageBreak())
    
    # Extracted Data Section
    section_num = 4 if validation_enabled else 3
    max_rows_to_show = 100
    elements.append(Paragraph(f"{section_num}. Extracted Data", heading_style))
    
    if extracted_data and len(extracted_data) > 0:
        # Determine columns to show - use all schema fields
        if schema_fields:
            columns = list(schema_fields)  # Use all columns
        else:
            sample = extracted_data[0]
            columns = [k for k in sample.keys() if k not in ('__source', '__url', 'row_accept_candidate')]
        
        # Prepare data with __source mapped to 'Source'
        prepared_data = []
        for entry in extracted_data:
            row_data = {'Source': entry.get('__source', '')}
            for col in columns:
                row_data[col] = entry.get(col, '')
            prepared_data.append(row_data)
        
        display_columns = ['Source'] + columns
        
        # Create table using helper function - it handles width calculation and splitting
        data_table, rows_shown = _create_data_table(
            columns=display_columns,
            data=prepared_data,
            available_width=available_width,
            header_bg_color='#16213e',
            row_alt_color='#f5f5f5',
            font_size=6 if len(columns) > 8 else 7,
            max_rows=max_rows_to_show
        )
        elements.append(data_table)
        
        if len(extracted_data) > rows_shown:
            elements.append(Spacer(1, 8))
            elements.append(Paragraph(
                f"Showing {rows_shown} of {len(extracted_data)} total rows",
                small_style
            ))
    else:
        elements.append(Paragraph("No data extracted.", normal_style))
    
    # Validated Data Section (if different from extracted)
    if validation_enabled and validated_data and len(validated_data) > 0:
        elements.append(PageBreak())
        section_num += 1
        elements.append(Paragraph(f"{section_num}. Validated Data (Accepted Rows)", heading_style))
        
        if schema_fields:
            columns = list(schema_fields)
        else:
            sample = validated_data[0]
            columns = [k for k in sample.keys() if k not in ('__source', '__url', 'row_accept_candidate')]
        
        # Prepare data
        prepared_data = []
        for entry in validated_data:
            row_data = {'Source': entry.get('__source', '')}
            for col in columns:
                row_data[col] = entry.get(col, '')
            prepared_data.append(row_data)
        
        display_columns = ['Source'] + columns
        
        val_data_table, rows_shown = _create_data_table(
            columns=display_columns,
            data=prepared_data,
            available_width=available_width,
            header_bg_color='#0f3460',
            row_alt_color='#e8f4e8',
            font_size=6 if len(columns) > 8 else 7,
            max_rows=max_rows_to_show
        )
        elements.append(val_data_table)
        
        if len(validated_data) > rows_shown:
            elements.append(Spacer(1, 8))
            elements.append(Paragraph(
                f"Showing {rows_shown} of {len(validated_data)} accepted rows",
                small_style
            ))
    
    # Footer
    elements.append(Spacer(1, 30))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(
        f"Report generated by CretExtract • Run ID: {run_data.get('id', 'N/A')}",
        small_style
    ))
    
    # Build PDF
    doc.build(elements)
    
    return output_path


def generate_validation_report_pdf(
    run_data: Dict[str, Any],
    extracted_data: List[Dict[str, Any]],
    validation_report: Dict[str, Any],
    validation_config: Optional[Dict[str, Any]],
    output_path: str,
    schema_fields: Optional[List[str]] = None
) -> str:
    """
    Generate a comprehensive PDF validation report.
    
    Includes:
    - Validation summary
    - Rules by severity (errors vs warnings)
    - Constraints by column
    - Original extracted data
    - Row-level validation flags
    """
    # Determine columns for landscape
    num_columns = len(schema_fields) if schema_fields else 0
    if num_columns == 0 and extracted_data:
        sample = extracted_data[0]
        num_columns = len([k for k in sample.keys() if k not in ('__source', '__url', 'row_accept_candidate')])
    
    use_landscape = num_columns > 5
    page_size = landscape(A4) if use_landscape else A4
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=page_size,
        rightMargin=1*cm,
        leftMargin=1*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm
    )
    
    available_width = page_size[0] - 2*cm
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'ValTitle',
        parent=styles['Heading1'],
        fontSize=20 if use_landscape else 24,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1a1a2e')
    )
    
    heading_style = ParagraphStyle(
        'ValHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=15,
        spaceAfter=8,
        textColor=colors.HexColor('#16213e')
    )
    
    subheading_style = ParagraphStyle(
        'ValSubheading',
        parent=styles['Heading3'],
        fontSize=11,
        spaceBefore=12,
        spaceAfter=6,
        textColor=colors.HexColor('#0f3460')
    )
    
    normal_style = ParagraphStyle(
        'ValNormal',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=4
    )
    
    small_style = ParagraphStyle(
        'ValSmall',
        parent=styles['Normal'],
        fontSize=7,
        textColor=colors.grey
    )
    
    elements = []
    
    # Title
    run_name = run_data.get('name', 'Extraction Run')
    elements.append(Paragraph(f"Validation Report: {run_name}", title_style))
    elements.append(Paragraph(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        small_style
    ))
    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    elements.append(Spacer(1, 20))
    
    # Section 1: Validation Summary
    elements.append(Paragraph("1. Validation Summary", heading_style))
    
    val_results = validation_report.get("validation_results", [])
    total_rules = len(val_results)
    passed_rules = sum(1 for r in val_results if r.get("passed", False))
    error_failures = sum(1 for r in val_results if r.get("severity") == "error" and not r.get("passed", False))
    warning_failures = sum(1 for r in val_results if r.get("severity") == "warning" and not r.get("passed", False))
    
    summary_data = [
        ["Metric", "Value"],
        ["Total Rows", str(validation_report.get("total_rows", 0))],
        ["Total Rules", str(total_rules)],
        ["Passed Rules", str(passed_rules)],
        ["Failed Rules (Errors)", str(error_failures)],
        ["Warnings", str(warning_failures)],
    ]
    
    summary_table = Table(summary_data, colWidths=[6*cm, 10*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Section 2: Rules by Severity
    elements.append(Paragraph("2. Validation Rules", heading_style))
    
    config_rules_lookup = {}
    if validation_config and "rules" in validation_config:
        for rule in validation_config["rules"]:
            config_rules_lookup[rule.get("rule_id")] = rule
    
    rules_data = [["Rule ID", "Name", "Severity", "Status", "Affected Rows"]]
    for result in val_results:
        rule_id = result.get("rule_id", "")
        config_rule = config_rules_lookup.get(rule_id, {})
        severity = result.get("severity", "warning")
        raw_passed = result.get("passed", False)
        status = "PASS" if raw_passed else ("FAIL" if severity == "error" else "WARN")
        affected_count = len(result.get("affected_rows", []))
        
        rules_data.append([
            rule_id,
            config_rule.get("name", "")[:40],
            severity.upper(),
            status,
            str(affected_count)
        ])
    
    rules_table = Table(rules_data, colWidths=[3*cm, 8*cm, 2*cm, 2*cm, 2*cm])
    rules_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#16213e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    elements.append(rules_table)
    elements.append(Spacer(1, 20))
    
    # Section 3: Constraints by Column with Acceptance/Refusal Rates
    elements.append(Paragraph("3. Column Statistics", heading_style))
    
    # Build column-to-rules mapping
    column_to_rules = {}
    for result in val_results:
        rule_id = result.get("rule_id", "")
        config_rule = config_rules_lookup.get(rule_id, {})
        for col in config_rule.get("columns", []):
            if col not in column_to_rules:
                column_to_rules[col] = []
            column_to_rules[col].append({
                "rule_id": rule_id,
                "severity": result.get("severity", "warning"),
                "passed": result.get("passed", False),
                "affected_rows": set(result.get("affected_rows", []))
            })
    
    total_rows = validation_report.get("total_rows", len(extracted_data))
    
    col_data = [["Column", "Rules", "Errors", "Warnings", "Affected Rows", "Accept Rate", "Status"]]
    for col in sorted(column_to_rules.keys()):
        rules = column_to_rules[col]
        error_fails = sum(1 for r in rules if r["severity"] == "error" and not r["passed"])
        warnings = sum(1 for r in rules if r["severity"] == "warning" and not r["passed"])
        
        # Calculate affected rows for this column (union of all rule failures)
        affected_rows = set()
        for r in rules:
            if not r["passed"]:
                affected_rows.update(r["affected_rows"])
        
        affected_count = len(affected_rows)
        accept_rate = ((total_rows - affected_count) / total_rows * 100) if total_rows > 0 else 100
        status = "FAIL" if error_fails > 0 else ("WARN" if warnings > 0 else "PASS")
        
        col_data.append([
            col[:25], 
            str(len(rules)), 
            str(error_fails), 
            str(warnings), 
            str(affected_count),
            f"{accept_rate:.1f}%",
            status
        ])
    
    col_table = Table(col_data, colWidths=[5*cm, 1.5*cm, 1.5*cm, 1.5*cm, 2*cm, 2*cm, 1.5*cm])
    col_table_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f3460')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]
    # Color code status column
    for i, row in enumerate(col_data[1:], start=1):
        status = row[-1]
        if status == "PASS":
            col_table_style.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#d4edda')))
        elif status == "FAIL":
            col_table_style.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#f8d7da')))
        else:  # WARN
            col_table_style.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#fff3cd')))
    
    col_table = Table(col_data, colWidths=[5*cm, 1.5*cm, 1.5*cm, 1.5*cm, 2*cm, 2*cm, 1.5*cm])
    col_table.setStyle(TableStyle(col_table_style))
    elements.append(col_table)
    
    # Page break before data
    elements.append(PageBreak())
    
    # Build set of rejected row indices (rows that failed any error-severity rule)
    rejected_rows = set()
    for result in val_results:
        if result.get("severity") == "error" and not result.get("passed", False):
            rejected_rows.update(result.get("affected_rows", []))
    
    accepted_count = total_rows - len(rejected_rows)
    
    # Section 4: Data Table with Row-Level Coloring
    elements.append(Paragraph("4. Extracted Data with Validation Status", heading_style))
    elements.append(Paragraph(
        f"<b>Accepted:</b> {accepted_count} rows (green) | <b>Rejected:</b> {len(rejected_rows)} rows (red)",
        normal_style
    ))
    elements.append(Spacer(1, 10))
    
    if extracted_data and len(extracted_data) > 0:
        if schema_fields:
            columns = list(schema_fields)
        else:
            sample = extracted_data[0]
            columns = [k for k in sample.keys() if k not in ('__source', '__url', 'row_accept_candidate')]
        
        # Limit columns for readability
        max_cols = 10 if use_landscape else 6
        display_cols = columns[:max_cols]
        
        # Build table data with Status column
        table_data = [["#", "Status", "Source"] + [_truncate_text(c, 15) for c in display_cols]]
        
        max_rows = 150
        rows_to_show = min(len(extracted_data), max_rows)
        
        for i in range(rows_to_show):
            entry = extracted_data[i]
            is_rejected = i in rejected_rows
            status = "REJECT" if is_rejected else "ACCEPT"
            source = str(entry.get('__source', ''))[:15]
            
            row = [str(i + 1), status, source]
            for col in display_cols:
                val = entry.get(col, '')
                row.append(_truncate_text(str(val) if val is not None else '', 20))
            table_data.append(row)
        
        # Calculate column widths
        num_cols = len(table_data[0])
        status_width = 1.5*cm
        num_width = 0.8*cm
        source_width = 2*cm
        remaining_width = available_width - status_width - num_width - source_width
        data_col_width = remaining_width / max(1, num_cols - 3)
        
        col_widths = [num_width, status_width, source_width] + [data_col_width] * (num_cols - 3)
        
        data_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        
        # Build style with row-level coloring
        table_style = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#16213e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (0, 0), (1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('GRID', (0, 0), (-1, -1), 0.3, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]
        
        # Color each row based on acceptance status
        green_tint = colors.HexColor('#d4edda')  # Light green for accepted
        red_tint = colors.HexColor('#f8d7da')    # Light red for rejected
        
        for i in range(rows_to_show):
            row_idx = i + 1  # +1 for header
            is_rejected = i in rejected_rows
            bg_color = red_tint if is_rejected else green_tint
            table_style.append(('BACKGROUND', (0, row_idx), (-1, row_idx), bg_color))
        
        data_table.setStyle(TableStyle(table_style))
        elements.append(data_table)
        
        if len(extracted_data) > rows_to_show:
            elements.append(Spacer(1, 8))
            elements.append(Paragraph(
                f"Showing {rows_to_show} of {len(extracted_data)} total rows. Download Excel report for complete data.",
                small_style
            ))
        
        # Add column truncation note if applicable
        if len(columns) > max_cols:
            elements.append(Paragraph(
                f"Showing {max_cols} of {len(columns)} columns. Download Excel report for all columns.",
                small_style
            ))
    else:
        elements.append(Paragraph("No extracted data available.", normal_style))
    
    # Footer
    elements.append(Spacer(1, 30))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(
        f"Validation Report generated by CretExtract • Run ID: {run_data.get('id', 'N/A')}",
        small_style
    ))
    
    doc.build(elements)
    return output_path


def generate_report_from_run_dir(
    run_id: str,
    run_data: Dict[str, Any],
    output_dir: str,
    report_output_path: str
) -> str:
    """
    Generate report by reading files from run output directory.
    
    Args:
        run_id: Run ID
        run_data: Run metadata
        output_dir: Run's output directory
        report_output_path: Where to save the PDF
        
    Returns:
        Path to generated PDF
    """
    # Load extracted data
    extracted_data = []
    global_json = os.path.join(output_dir, "global_data.json")
    if os.path.exists(global_json):
        with open(global_json, "r", encoding="utf-8") as f:
            extracted_data = json.load(f)
            if not isinstance(extracted_data, list):
                extracted_data = [extracted_data] if extracted_data else []
    
    # Load validated data
    validated_data = None
    validated_json = os.path.join(output_dir, "validated_data.json")
    if os.path.exists(validated_json):
        with open(validated_json, "r", encoding="utf-8") as f:
            validated_data = json.load(f)
            if not isinstance(validated_data, list):
                validated_data = [validated_data] if validated_data else []
    
    # Load validation report
    validation_report = None
    validation_report_path = os.path.join(output_dir, "validation", "validation_report.json")
    if os.path.exists(validation_report_path):
        with open(validation_report_path, "r", encoding="utf-8") as f:
            validation_report = json.load(f)
    
    # Load schema fields
    schema_fields = None
    schema_mapping_path = os.path.join(output_dir, "schema_mapping.json")
    if os.path.exists(schema_mapping_path):
        with open(schema_mapping_path, "r", encoding="utf-8") as f:
            schema_mapping = json.load(f)
            if 'fields' in schema_mapping:
                schema_fields = schema_mapping['fields']
            elif 'fieldDefs' in schema_mapping:
                schema_fields = [f.get('name') for f in schema_mapping['fieldDefs'] if f.get('name')]
    
    return generate_run_report(
        run_data=run_data,
        extracted_data=extracted_data,
        validated_data=validated_data,
        validation_report=validation_report,
        output_path=report_output_path,
        schema_fields=schema_fields
    )
